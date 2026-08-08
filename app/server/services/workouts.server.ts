import { and, asc, desc, eq, gte, inArray, sql } from "drizzle-orm";

import type { Database } from "~/db";
import {
  exercise,
  workout,
  workoutExercise,
  workoutSet,
  type Actor,
} from "~/db/schema";
import type {
  AddExerciseInput,
  CancelWorkoutInput,
  FinishWorkoutInput,
  ListWorkoutsInput,
  LogSetInput,
  PlannedExercise,
  ProposePlanInput,
  RemoveExerciseInput,
  StartWorkoutInput,
} from "./service-inputs";
import type {
  ExerciseView,
  SetView,
  WorkoutDetailView,
  WorkoutExerciseView,
  WorkoutSummaryView,
} from "~/domain/types";

import { conflict, invalid, notFound } from "./errors";
import { newId } from "./ids";

/** Anything Drizzle can execute synchronously against SQLite. */
type BatchStatement = { run: () => unknown };

/**
 * Runs a set of statements as one all-or-nothing unit.
 *
 * This was a D1 `batch`, which was the only all-or-nothing primitive that
 * runtime offered. SQLite has real interactive transactions, so the same
 * guarantee comes from a transaction — and a stronger one, since a failure
 * rolls back rather than depending on the batch being accepted whole.
 *
 * The callback must stay synchronous: better-sqlite3 transactions are, and an
 * `await` inside one would commit before the awaited work ran.
 */
function runBatch(db: Database, statements: BatchStatement[]): void {
  if (statements.length === 0) return;
  db.transaction(() => {
    for (const statement of statements) statement.run();
  });
}

/* -------------------------------------------------------------------------- */
/* Reads                                                                      */
/* -------------------------------------------------------------------------- */

export async function listWorkouts(
  db: Database,
  userId: string,
  input: ListWorkoutsInput,
): Promise<WorkoutSummaryView[]> {
  const filters = [eq(workout.userId, userId)];

  if (input.status !== "any") {
    filters.push(eq(workout.status, input.status));
  }
  if (input.since) {
    // `since` is a calendar date; include the whole day in the user's frame of
    // reference by starting at midnight UTC.
    filters.push(gte(workout.startedAt, new Date(`${input.since}T00:00:00Z`)));
  }

  const rows = await db.query.workout.findMany({
    where: and(...filters),
    orderBy: desc(workout.startedAt),
    limit: input.limit,
    with: {
      exercises: {
        with: { sets: true, exercise: true },
      },
    },
  });

  return rows.map((row) => toSummaryView(row));
}

export async function getWorkoutDetail(
  db: Database,
  userId: string,
  workoutId: string,
): Promise<WorkoutDetailView> {
  const row = await findWorkoutWithChildren(db, userId, workoutId);
  if (!row) throw notFound("Workout");
  return toDetailView(row);
}

export async function getActiveWorkout(
  db: Database,
  userId: string,
): Promise<WorkoutDetailView | null> {
  const row = await db.query.workout.findFirst({
    where: and(eq(workout.userId, userId), eq(workout.status, "active")),
    orderBy: desc(workout.startedAt),
    with: {
      exercises: {
        orderBy: asc(workoutExercise.position),
        with: { sets: { orderBy: asc(workoutSet.setIndex) }, exercise: true },
      },
    },
  });

  return row ? toDetailView(row) : null;
}

/* -------------------------------------------------------------------------- */
/* Lifecycle                                                                  */
/* -------------------------------------------------------------------------- */

export async function startWorkout(
  db: Database,
  userId: string,
  input: StartWorkoutInput,
  actor: Actor,
): Promise<WorkoutDetailView> {
  // Resolve any supplied plan *before* anything is written or closed. An agent
  // naming an exercise that does not exist is the expected failure here, and
  // doing this first is what makes that failure free: no empty active workout
  // left behind to block every later start_workout, and no session of the
  // person's closed out for a workout that then never began.
  if (input.exercises && input.exercises.length > 0) {
    await resolvePlannedExercises(db, userId, input.exercises);
  }

  // One session at a time. Never returning the existing session in place of a
  // new one — that would let an agent silently log into the wrong workout — so
  // the running one is dealt with explicitly first.
  const existing = await getActiveWorkout(db, userId);
  if (existing) {
    await closeForRestart(db, userId, existing, input.ifActive ?? "finish");
  }

  const now = new Date();
  const id = newId();

  await db.insert(workout).values({
    id,
    userId,
    title: input.title?.trim() || defaultTitle(now),
    status: "active",
    notes: input.notes?.trim() || null,
    startedAt: now,
    createdAt: now,
    updatedAt: now,
  });

  // A plan supplied up front is applied here so "start a session that hits my
  // weak points" is one call. Reusing replacePlan rather than duplicating the
  // insert keeps exercise resolution, the set expansion and the ordering rules
  // identical between this path and propose_workout_plan.
  if (input.exercises && input.exercises.length > 0) {
    return replacePlan(
      db,
      userId,
      {
        workoutId: id,
        title: input.title,
        notes: input.notes,
        exercises: input.exercises,
      },
      actor,
    );
  }

  return getWorkoutDetail(db, userId, id);
}

/**
 * Replaces the workout's plan wholesale.
 *
 * This is the "agent suggests a workout" path. It refuses to run once any set
 * has been logged, so a suggestion can never silently discard work the person
 * already did.
 */
export async function replacePlan(
  db: Database,
  userId: string,
  input: ProposePlanInput,
  actor: Actor,
): Promise<WorkoutDetailView> {
  const existing = await requireEditableWorkout(db, userId, input.workoutId);

  const loggedSets = existing.exercises
    .flatMap((entry) => entry.sets)
    .filter((set) => set.status !== "pending");

  if (loggedSets.length > 0) {
    throw conflict(
      "workout_already_started",
      `${loggedSets.length} set(s) have already been logged in this workout, so the plan cannot be replaced. Use add_exercise_to_workout to extend it instead.`,
    );
  }

  const resolved = await resolvePlannedExercises(db, userId, input.exercises);

  const now = new Date();
  const statements: BatchStatement[] = [
    db
      .delete(workoutExercise)
      .where(eq(workoutExercise.workoutId, existing.id)),
    db
      .update(workout)
      .set({
        title: input.title?.trim() || existing.title,
        notes: input.notes?.trim() ?? existing.notes,
        plannedBy: actor,
        updatedAt: now,
      })
      .where(eq(workout.id, existing.id)),
  ];

  resolved.forEach((entry, index) => {
    const workoutExerciseId = newId();
    statements.push(
      db.insert(workoutExercise).values({
        id: workoutExerciseId,
        workoutId: existing.id,
        exerciseId: entry.exercise.id,
        position: index,
        targetSets: entry.plan.sets.length,
        targetReps: entry.plan.sets[0]?.reps ?? null,
        targetWeightKg: entry.plan.sets[0]?.weightKg ?? null,
        rationale: entry.plan.rationale?.trim() || null,
        createdAt: now,
      }),
    );

    entry.plan.sets.forEach((set, setIndex) => {
      statements.push(
        db.insert(workoutSet).values({
          id: newId(),
          workoutExerciseId,
          setIndex: setIndex + 1,
          reps: set.reps ?? null,
          weightKg: set.weightKg ?? null,
          rpe: set.rpe ?? null,
          durationSeconds: set.durationSeconds ?? null,
          distanceMeters: set.distanceMeters ?? null,
          isWarmup: set.isWarmup,
          status: "pending",
          createdAt: now,
        }),
      );
    });
  });

  // One atomic unit, which is what keeps a half-written plan off the page.
  runBatch(db, statements);

  return getWorkoutDetail(db, userId, existing.id);
}

export async function addExerciseToWorkout(
  db: Database,
  userId: string,
  input: AddExerciseInput,
): Promise<WorkoutDetailView> {
  const existing = await requireEditableWorkout(db, userId, input.workoutId);

  if (existing.exercises.length >= 30) {
    throw conflict(
      "workout_too_large",
      "This workout already has 30 exercises, which is the maximum.",
    );
  }

  const [resolved] = await resolvePlannedExercises(db, userId, [
    {
      exerciseId: input.exerciseId,
      exerciseName: input.exerciseName,
      sets: input.sets,
      rationale: input.rationale,
    },
  ]);
  if (!resolved) throw invalid("unresolved_exercise", "No exercise resolved.");

  const now = new Date();
  const insertAt = Math.min(
    input.position ?? existing.exercises.length,
    existing.exercises.length,
  );

  const statements: BatchStatement[] = [];

  // Shift positions from the tail backwards so the unique (workout, position)
  // index never sees a duplicate mid-batch.
  for (let i = existing.exercises.length - 1; i >= insertAt; i--) {
    const entry = existing.exercises[i]!;
    statements.push(
      db
        .update(workoutExercise)
        .set({ position: i + 1 })
        .where(eq(workoutExercise.id, entry.id)),
    );
  }

  const workoutExerciseId = newId();
  statements.push(
    db.insert(workoutExercise).values({
      id: workoutExerciseId,
      workoutId: existing.id,
      exerciseId: resolved.exercise.id,
      position: insertAt,
      targetSets: resolved.plan.sets.length,
      targetReps: resolved.plan.sets[0]?.reps ?? null,
      targetWeightKg: resolved.plan.sets[0]?.weightKg ?? null,
      rationale: resolved.plan.rationale?.trim() || null,
      createdAt: now,
    }),
  );

  resolved.plan.sets.forEach((set, setIndex) => {
    statements.push(
      db.insert(workoutSet).values({
        id: newId(),
        workoutExerciseId,
        setIndex: setIndex + 1,
        reps: set.reps ?? null,
        weightKg: set.weightKg ?? null,
        rpe: set.rpe ?? null,
        durationSeconds: set.durationSeconds ?? null,
        distanceMeters: set.distanceMeters ?? null,
        isWarmup: set.isWarmup,
        status: "pending",
        createdAt: now,
      }),
    );
  });

  statements.push(
    db
      .update(workout)
      .set({ updatedAt: now })
      .where(eq(workout.id, existing.id)),
  );

  runBatch(db, statements);
  return getWorkoutDetail(db, userId, existing.id);
}

export async function removeExerciseFromWorkout(
  db: Database,
  userId: string,
  input: RemoveExerciseInput,
): Promise<WorkoutDetailView> {
  const existing = await requireEditableWorkout(db, userId, input.workoutId);

  const target = existing.exercises.find(
    (entry) => entry.id === input.workoutExerciseId,
  );
  if (!target) throw notFound("Exercise in this workout");

  const now = new Date();
  const statements: BatchStatement[] = [
    db.delete(workoutExercise).where(eq(workoutExercise.id, target.id)),
  ];

  // Close the positional gap, front to back.
  existing.exercises
    .filter((entry) => entry.position > target.position)
    .forEach((entry) => {
      statements.push(
        db
          .update(workoutExercise)
          .set({ position: entry.position - 1 })
          .where(eq(workoutExercise.id, entry.id)),
      );
    });

  statements.push(
    db
      .update(workout)
      .set({ updatedAt: now })
      .where(eq(workout.id, existing.id)),
  );

  runBatch(db, statements);
  return getWorkoutDetail(db, userId, existing.id);
}

/**
 * Records the result of a single set.
 *
 * Upserts on (exercise, setIndex): a planned set is filled in, and a set beyond
 * the plan is appended. That lets the person do an extra set without the agent
 * having to re-plan, which is the common case in a real session.
 */
export async function logSet(
  db: Database,
  userId: string,
  input: LogSetInput,
  actor: Actor,
): Promise<WorkoutDetailView> {
  const existing = await requireEditableWorkout(db, userId, input.workoutId);

  const entry = existing.exercises.find(
    (candidate) => candidate.id === input.workoutExerciseId,
  );
  if (!entry) throw notFound("Exercise in this workout");

  const maxIndex = entry.sets.reduce(
    (max, set) => Math.max(max, set.setIndex),
    0,
  );
  if (input.setIndex > maxIndex + 1) {
    throw invalid(
      "set_index_out_of_range",
      `Set ${input.setIndex} skips ahead: this exercise has ${maxIndex} set(s), so the next one to log is ${maxIndex + 1}.`,
    );
  }

  const target = entry.sets.find((set) => set.setIndex === input.setIndex);
  const now = new Date();

  const values = {
    reps: input.reps ?? target?.reps ?? null,
    weightKg: input.weightKg ?? target?.weightKg ?? null,
    rpe: input.rpe ?? target?.rpe ?? null,
    durationSeconds: input.durationSeconds ?? target?.durationSeconds ?? null,
    distanceMeters: input.distanceMeters ?? target?.distanceMeters ?? null,
    status: input.status,
    loggedBy: actor,
    completedAt: input.status === "completed" ? now : null,
  };

  if (target) {
    await db.update(workoutSet).set(values).where(eq(workoutSet.id, target.id));
  } else {
    await db.insert(workoutSet).values({
      id: newId(),
      workoutExerciseId: entry.id,
      setIndex: input.setIndex,
      isWarmup: false,
      createdAt: now,
      ...values,
    });
  }

  await db
    .update(workout)
    .set({ updatedAt: now })
    .where(eq(workout.id, existing.id));

  return getWorkoutDetail(db, userId, existing.id);
}

export async function appendNote(
  db: Database,
  userId: string,
  workoutId: string,
  note: string,
): Promise<WorkoutDetailView> {
  const existing = await requireEditableWorkout(db, userId, workoutId);
  const trimmed = note.trim();

  const combined = existing.notes ? `${existing.notes}\n${trimmed}` : trimmed;
  // Bound total note length so an agent loop cannot grow the row without limit.
  const bounded = combined.slice(-4000);

  await db
    .update(workout)
    .set({ notes: bounded, updatedAt: new Date() })
    .where(eq(workout.id, existing.id));

  return getWorkoutDetail(db, userId, existing.id);
}

export async function finishWorkout(
  db: Database,
  userId: string,
  input: FinishWorkoutInput,
): Promise<WorkoutDetailView> {
  const existing = await requireEditableWorkout(db, userId, input.workoutId);

  const now = new Date();
  const notes = input.notes?.trim()
    ? existing.notes
      ? `${existing.notes}\n${input.notes.trim()}`
      : input.notes.trim()
    : existing.notes;

  runBatch(db, [
    // Anything still pending when the session ends was not performed.
    db
      .update(workoutSet)
      .set({ status: "skipped" })
      .where(
        and(
          eq(workoutSet.status, "pending"),
          inArray(
            workoutSet.workoutExerciseId,
            existing.exercises.map((entry) => entry.id),
          ),
        ),
      ),
    db
      .update(workout)
      .set({
        status: "completed",
        completedAt: now,
        updatedAt: now,
        notes: notes ?? null,
      })
      .where(eq(workout.id, existing.id)),
  ]);

  return getWorkoutDetail(db, userId, existing.id);
}

export async function cancelWorkout(
  db: Database,
  userId: string,
  input: CancelWorkoutInput,
): Promise<WorkoutDetailView> {
  const existing = await requireEditableWorkout(db, userId, input.workoutId);

  const now = new Date();
  const notes = input.reason?.trim()
    ? `${existing.notes ? `${existing.notes}\n` : ""}Discarded: ${input.reason.trim()}`
    : existing.notes;

  await db
    .update(workout)
    .set({
      status: "abandoned",
      completedAt: now,
      updatedAt: now,
      notes: notes ?? null,
    })
    .where(eq(workout.id, existing.id));

  return getWorkoutDetail(db, userId, existing.id);
}

/* -------------------------------------------------------------------------- */
/* Internals                                                                  */
/* -------------------------------------------------------------------------- */

type WorkoutRow = NonNullable<
  Awaited<ReturnType<typeof findWorkoutWithChildren>>
>;

function findWorkoutWithChildren(
  db: Database,
  userId: string,
  workoutId: string,
) {
  return db.query.workout.findFirst({
    // Scoping by userId here is the authorization check: a workout belonging to
    // someone else is indistinguishable from one that does not exist.
    where: and(eq(workout.id, workoutId), eq(workout.userId, userId)),
    with: {
      exercises: {
        orderBy: asc(workoutExercise.position),
        with: { sets: { orderBy: asc(workoutSet.setIndex) }, exercise: true },
      },
    },
  });
}

async function requireEditableWorkout(
  db: Database,
  userId: string,
  workoutId: string,
) {
  const row = await findWorkoutWithChildren(db, userId, workoutId);
  if (!row) throw notFound("Workout");

  if (row.status !== "active") {
    throw conflict(
      "workout_not_active",
      `This workout is ${row.status} and can no longer be modified. Start a new one with start_workout.`,
    );
  }

  return row;
}

/**
 * Clears the way for a new session.
 *
 * Which of finish/discard applies is decided here rather than by the caller,
 * because it is a judgement about the person's history and it has to be the
 * same one everywhere. Finishing wins whenever real work was logged: an
 * abandoned session is excluded from insights entirely, so discarding sets they
 * actually did would quietly rewrite their training record. A session with
 * nothing logged is the opposite case — filing it would put an empty workout in
 * the history and count it against their weekly target — so that one is
 * discarded. Only an explicit "discard" drops logged sets, and the person
 * approves that in the confirmation dialog before the call is made.
 */
async function closeForRestart(
  db: Database,
  userId: string,
  existing: WorkoutDetailView,
  mode: NonNullable<StartWorkoutInput["ifActive"]>,
): Promise<void> {
  if (mode === "error") {
    throw conflict(
      "workout_already_active",
      `A workout ("${existing.title}") is already in progress. Call start_workout again with ifActive:"finish" to close it out and begin the new session in one step, or ifActive:"discard" to drop it without recording it.`,
    );
  }

  if (mode === "discard" || existing.completedSets === 0) {
    await cancelWorkout(db, userId, {
      workoutId: existing.id,
      reason: "Superseded by a new session.",
    });
    return;
  }

  await finishWorkout(db, userId, { workoutId: existing.id });
}

interface ResolvedExercise {
  exercise: typeof exercise.$inferSelect;
  plan: PlannedExercise;
}

/**
 * Maps planned entries onto catalog rows.
 *
 * Name matching is deliberately strict: an ambiguous name is an error rather
 * than a guess, because silently picking the wrong exercise corrupts the
 * training history the agent later reasons over.
 */
async function resolvePlannedExercises(
  db: Database,
  userId: string,
  plans: PlannedExercise[],
): Promise<ResolvedExercise[]> {
  const results: ResolvedExercise[] = [];

  for (const plan of plans) {
    if (plan.exerciseId) {
      const found = await db.query.exercise.findFirst({
        where: and(eq(exercise.id, plan.exerciseId), visibleToUser(userId)),
      });
      if (!found) {
        throw invalid(
          "unknown_exercise",
          `No exercise with id "${plan.exerciseId}". Use search_exercises to find valid ids.`,
        );
      }
      results.push({ exercise: found, plan });
      continue;
    }

    const name = plan.exerciseName?.trim();
    if (!name) {
      throw invalid(
        "missing_exercise",
        "Each planned exercise needs either exerciseId or exerciseName.",
      );
    }

    const matches = await db
      .select()
      .from(exercise)
      .where(
        and(
          sql`lower(${exercise.name}) = lower(${name})`,
          visibleToUser(userId),
        ),
      )
      .limit(2);

    if (matches.length === 1) {
      results.push({ exercise: matches[0]!, plan });
      continue;
    }

    if (matches.length === 0) {
      throw invalid(
        "unknown_exercise",
        `No exercise named "${name}". Call search_exercises to see what exists, then pass exerciseId.`,
      );
    }

    throw invalid(
      "ambiguous_exercise",
      `"${name}" matches more than one exercise. Call search_exercises and pass an explicit exerciseId.`,
    );
  }

  return results;
}

/** Shared library rows plus the caller's own custom exercises. */
function visibleToUser(userId: string) {
  return sql`(${exercise.createdBy} is null or ${exercise.createdBy} = ${userId})`;
}

function defaultTitle(now: Date): string {
  const hour = now.getUTCHours();
  if (hour < 11) return "Morning workout";
  if (hour < 17) return "Afternoon workout";
  return "Evening workout";
}

/* -------------------------------------------------------------------------- */
/* View mapping                                                               */
/* -------------------------------------------------------------------------- */

export function toExerciseView(
  row: typeof exercise.$inferSelect,
): ExerciseView {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    primaryMuscle: row.primaryMuscle,
    secondaryMuscles: row.secondaryMuscles ?? [],
    equipment: row.equipment,
    modality: row.modality,
    isCustom: row.createdBy !== null,
  };
}

function toSetView(row: typeof workoutSet.$inferSelect): SetView {
  return {
    id: row.id,
    setIndex: row.setIndex,
    weightKg: row.weightKg,
    reps: row.reps,
    rpe: row.rpe,
    durationSeconds: row.durationSeconds,
    distanceMeters: row.distanceMeters,
    isWarmup: row.isWarmup,
    status: row.status,
    loggedBy: row.loggedBy,
    completedAt: row.completedAt?.toISOString() ?? null,
  };
}

function toExerciseEntryView(
  row: WorkoutRow["exercises"][number],
): WorkoutExerciseView {
  return {
    id: row.id,
    position: row.position,
    exercise: toExerciseView(row.exercise),
    targetSets: row.targetSets,
    targetReps: row.targetReps,
    targetWeightKg: row.targetWeightKg,
    rationale: row.rationale,
    sets: [...row.sets].sort((a, b) => a.setIndex - b.setIndex).map(toSetView),
  };
}

/** Load actually performed: completed working sets only, warmups excluded. */
export function computeVolumeKg(sets: SetView[]): number {
  return sets.reduce((total, set) => {
    if (set.status !== "completed" || set.isWarmup) return total;
    if (set.weightKg === null || set.reps === null) return total;
    return total + set.weightKg * set.reps;
  }, 0);
}

function toSummaryView(row: WorkoutRow): WorkoutSummaryView {
  const sets = row.exercises.flatMap((entry) => entry.sets.map(toSetView));
  const durationMinutes = row.completedAt
    ? Math.max(
        0,
        Math.round(
          (row.completedAt.getTime() - row.startedAt.getTime()) / 60_000,
        ),
      )
    : null;

  return {
    id: row.id,
    title: row.title,
    status: row.status,
    plannedBy: row.plannedBy,
    startedAt: row.startedAt.toISOString(),
    completedAt: row.completedAt?.toISOString() ?? null,
    exerciseCount: row.exercises.length,
    completedSets: sets.filter((set) => set.status === "completed").length,
    totalVolumeKg: Math.round(computeVolumeKg(sets)),
    durationMinutes,
  };
}

function toDetailView(row: WorkoutRow): WorkoutDetailView {
  return {
    ...toSummaryView(row),
    notes: row.notes,
    exercises: [...row.exercises]
      .sort((a, b) => a.position - b.position)
      .map(toExerciseEntryView),
  };
}
