import { beforeEach, describe, expect, it } from "vitest";

import type { Database } from "~/db";
import { DomainError } from "~/server/services/errors";
import {
  addExerciseToWorkout,
  cancelWorkout,
  finishWorkout,
  getActiveWorkout,
  getWorkoutDetail,
  listWorkouts,
  logSet,
  removeExerciseFromWorkout,
  replacePlan,
  startWorkout,
} from "~/server/services/workouts.server";

import { createUser, seedExercises, testDb } from "./helpers";

describe("workout lifecycle", () => {
  let db: Database;
  let userId: string;

  beforeEach(async () => {
    db = testDb();
    await seedExercises(db);
    userId = (await createUser(db)).id;
  });

  const plan = (workoutId: string) => ({
    workoutId,
    title: "Push day",
    exercises: [
      {
        exerciseId: "bench-press",
        rationale: "Chest is the least recently trained group.",
        sets: [
          { weightKg: 60, reps: 8, isWarmup: false },
          { weightKg: 60, reps: 8, isWarmup: false },
          { weightKg: 60, reps: 6, isWarmup: false },
        ],
      },
      {
        exerciseId: "pull-up",
        sets: [{ reps: 8, isWarmup: false }],
      },
    ],
  });

  it("runs the full start → plan → log → finish flow", async () => {
    const started = await startWorkout(db, userId, {}, "human");
    expect(started.status).toBe("active");
    expect(started.exercises).toHaveLength(0);

    const planned = await replacePlan(db, userId, plan(started.id), "agent");
    expect(planned.title).toBe("Push day");
    expect(planned.plannedBy).toBe("agent");
    expect(planned.exercises).toHaveLength(2);
    expect(planned.exercises[0]!.sets).toHaveLength(3);
    expect(planned.exercises[0]!.rationale).toContain("least recently trained");

    const bench = planned.exercises[0]!;
    const logged = await logSet(
      db,
      userId,
      {
        workoutId: started.id,
        workoutExerciseId: bench.id,
        setIndex: 1,
        weightKg: 62.5,
        reps: 8,
        status: "completed",
      },
      "agent",
    );

    const firstSet = logged.exercises[0]!.sets[0]!;
    expect(firstSet.status).toBe("completed");
    expect(firstSet.weightKg).toBe(62.5);
    expect(firstSet.loggedBy).toBe("agent");
    expect(logged.totalVolumeKg).toBe(Math.round(62.5 * 8));

    const finished = await finishWorkout(db, userId, {
      workoutId: started.id,
    });
    expect(finished.status).toBe("completed");
    expect(finished.completedAt).not.toBeNull();
    // Everything still pending at the end counts as skipped, not completed.
    expect(finished.completedSets).toBe(1);
    expect(
      finished.exercises
        .flatMap((entry) => entry.sets)
        .filter((set) => set.status === "skipped"),
    ).toHaveLength(3);

    expect(await getActiveWorkout(db, userId)).toBeNull();
  });

  it("omitted fields on log_set fall back to the planned values", async () => {
    const started = await startWorkout(db, userId, {}, "human");
    const planned = await replacePlan(db, userId, plan(started.id), "agent");

    // Only ids and the index — the common "it went to plan" call.
    const logged = await logSet(
      db,
      userId,
      {
        workoutId: started.id,
        workoutExerciseId: planned.exercises[0]!.id,
        setIndex: 2,
        status: "completed",
      },
      "agent",
    );

    const set = logged.exercises[0]!.sets[1]!;
    expect(set.weightKg).toBe(60);
    expect(set.reps).toBe(8);
  });

  it("allows logging one set past the plan but not skipping ahead", async () => {
    const started = await startWorkout(db, userId, {}, "human");
    const planned = await replacePlan(db, userId, plan(started.id), "agent");
    const bench = planned.exercises[0]!;

    const extended = await logSet(
      db,
      userId,
      {
        workoutId: started.id,
        workoutExerciseId: bench.id,
        setIndex: 4,
        weightKg: 50,
        reps: 12,
        status: "completed",
      },
      "human",
    );
    expect(extended.exercises[0]!.sets).toHaveLength(4);

    await expect(
      logSet(
        db,
        userId,
        {
          workoutId: started.id,
          workoutExerciseId: bench.id,
          setIndex: 9,
          status: "completed",
        },
        "agent",
      ),
    ).rejects.toThrow(/skips ahead/);
  });

  it("refuses a second active workout", async () => {
    await startWorkout(db, userId, { title: "First" }, "human");

    await expect(startWorkout(db, userId, {}, "agent")).rejects.toMatchObject({
      code: "workout_already_active",
    });
  });

  it("refuses to replace a plan once sets are logged", async () => {
    const started = await startWorkout(db, userId, {}, "human");
    const planned = await replacePlan(db, userId, plan(started.id), "agent");

    await logSet(
      db,
      userId,
      {
        workoutId: started.id,
        workoutExerciseId: planned.exercises[0]!.id,
        setIndex: 1,
        status: "completed",
      },
      "human",
    );

    // The guard that stops a re-suggestion from wiping work already done.
    await expect(
      replacePlan(db, userId, plan(started.id), "agent"),
    ).rejects.toMatchObject({ code: "workout_already_started" });
  });

  it("rejects edits to a finished workout", async () => {
    const started = await startWorkout(db, userId, {}, "human");
    await replacePlan(db, userId, plan(started.id), "agent");
    await finishWorkout(db, userId, { workoutId: started.id });

    await expect(
      replacePlan(db, userId, plan(started.id), "agent"),
    ).rejects.toMatchObject({ code: "workout_not_active" });
  });

  it("keeps exercise positions contiguous through insert and remove", async () => {
    const started = await startWorkout(db, userId, {}, "human");
    await replacePlan(db, userId, plan(started.id), "agent");

    const inserted = await addExerciseToWorkout(db, userId, {
      workoutId: started.id,
      exerciseId: "back-squat",
      position: 0,
      sets: [{ weightKg: 100, reps: 5, isWarmup: false }],
    });

    expect(inserted.exercises.map((entry) => entry.exercise.name)).toEqual([
      "Back Squat",
      "Bench Press",
      "Pull-Up",
    ]);
    expect(inserted.exercises.map((entry) => entry.position)).toEqual([
      0, 1, 2,
    ]);

    const removed = await removeExerciseFromWorkout(db, userId, {
      workoutId: started.id,
      workoutExerciseId: inserted.exercises[1]!.id,
    });

    expect(removed.exercises.map((entry) => entry.exercise.name)).toEqual([
      "Back Squat",
      "Pull-Up",
    ]);
    expect(removed.exercises.map((entry) => entry.position)).toEqual([0, 1]);
  });

  it("resolves exercises by name, and refuses ambiguous ones", async () => {
    const started = await startWorkout(db, userId, {}, "human");

    const planned = await replacePlan(
      db,
      userId,
      {
        workoutId: started.id,
        exercises: [
          { exerciseName: "bench press", sets: [{ reps: 5, isWarmup: false }] },
        ],
      },
      "agent",
    );
    // Case-insensitive match onto the single catalog row.
    expect(planned.exercises[0]!.exercise.id).toBe("bench-press");

    await expect(
      replacePlan(
        db,
        userId,
        {
          workoutId: started.id,
          exercises: [
            { exerciseName: "Row", sets: [{ reps: 5, isWarmup: false }] },
          ],
        },
        "agent",
      ),
    ).rejects.toMatchObject({ code: "ambiguous_exercise" });

    await expect(
      replacePlan(
        db,
        userId,
        {
          workoutId: started.id,
          exercises: [
            {
              exerciseName: "Nonexistent",
              sets: [{ reps: 5, isWarmup: false }],
            },
          ],
        },
        "agent",
      ),
    ).rejects.toMatchObject({ code: "unknown_exercise" });
  });

  it("excludes warmups and incomplete sets from volume", async () => {
    const started = await startWorkout(db, userId, {}, "human");
    const planned = await replacePlan(
      db,
      userId,
      {
        workoutId: started.id,
        exercises: [
          {
            exerciseId: "back-squat",
            sets: [
              { weightKg: 40, reps: 10, isWarmup: true },
              { weightKg: 100, reps: 5, isWarmup: false },
              { weightKg: 100, reps: 5, isWarmup: false },
            ],
          },
        ],
      },
      "agent",
    );

    const entryId = planned.exercises[0]!.id;
    await logSet(
      db,
      userId,
      {
        workoutId: started.id,
        workoutExerciseId: entryId,
        setIndex: 1,
        status: "completed",
      },
      "human",
    );
    const after = await logSet(
      db,
      userId,
      {
        workoutId: started.id,
        workoutExerciseId: entryId,
        setIndex: 2,
        status: "completed",
      },
      "human",
    );

    // 100x5 counts; the completed warmup and the still-pending set do not.
    expect(after.totalVolumeKg).toBe(500);
  });

  it("keeps abandoned workouts out of the completed history", async () => {
    const started = await startWorkout(
      db,
      userId,
      { title: "Bailed" },
      "human",
    );
    await cancelWorkout(db, userId, {
      workoutId: started.id,
      reason: "Gym was packed",
    });

    const completed = await listWorkouts(db, userId, {
      limit: 10,
      status: "completed",
    });
    expect(completed).toHaveLength(0);

    const all = await listWorkouts(db, userId, { limit: 10, status: "any" });
    expect(all).toHaveLength(1);
    expect(all[0]!.status).toBe("abandoned");
  });
});

describe("authorization", () => {
  it("hides one user's workout from another", async () => {
    const db = testDb();
    await seedExercises(db);

    const owner = await createUser(db);
    const stranger = await createUser(db);

    const workout = await startWorkout(db, owner.id, {}, "human");

    // A known-good id plus the wrong user must be indistinguishable from a
    // workout that does not exist — no existence oracle.
    await expect(
      getWorkoutDetail(db, stranger.id, workout.id),
    ).rejects.toMatchObject({ code: "not_found" });

    await expect(
      logSet(
        db,
        stranger.id,
        {
          workoutId: workout.id,
          workoutExerciseId: "anything",
          setIndex: 1,
          status: "completed",
        },
        "agent",
      ),
    ).rejects.toBeInstanceOf(DomainError);

    await expect(
      finishWorkout(db, stranger.id, { workoutId: workout.id }),
    ).rejects.toMatchObject({ code: "not_found" });

    // The owner is unaffected.
    expect((await getWorkoutDetail(db, owner.id, workout.id)).id).toBe(
      workout.id,
    );
  });
});

describe("starting a workout with a plan in one call", () => {
  let db: Database;
  let userId: string;

  beforeEach(async () => {
    db = testDb();
    await seedExercises(db);
    userId = (await createUser(db)).id;
  });

  it("creates the session and populates it", async () => {
    // The dashboard path: the planning tools are not registered there, so this
    // is the only way for an agent to act on "give me a workout" from it.
    const started = await startWorkout(
      db,
      userId,
      {
        title: "Push day",
        exercises: [
          {
            exerciseId: "bench-press",
            rationale: "Chest has had no work in two weeks.",
            sets: [
              { weightKg: 60, reps: 8, isWarmup: false },
              { weightKg: 60, reps: 8, isWarmup: false },
            ],
          },
          { exerciseId: "pull-up", sets: [{ reps: 8, isWarmup: false }] },
        ],
      },
      "agent",
    );

    expect(started.status).toBe("active");
    expect(started.title).toBe("Push day");
    expect(started.plannedBy).toBe("agent");
    expect(started.exercises).toHaveLength(2);
    expect(started.exercises[0]!.sets).toHaveLength(2);
    expect(started.exercises[0]!.rationale).toContain("two weeks");

    // And it is the one active session, not a second one alongside an empty.
    const active = await getActiveWorkout(db, userId);
    expect(active?.id).toBe(started.id);
  });

  it("still starts an empty session when no plan is given", async () => {
    const started = await startWorkout(db, userId, {}, "human");
    expect(started.exercises).toHaveLength(0);
    expect(started.plannedBy).toBeNull();
  });

  it("leaves no workout behind when the plan is invalid", async () => {
    await expect(
      startWorkout(
        db,
        userId,
        {
          exercises: [
            {
              exerciseName: "Nonexistent",
              sets: [{ reps: 5, isWarmup: false }],
            },
          ],
        },
        "agent",
      ),
    ).rejects.toMatchObject({ code: "unknown_exercise" });

    // A half-created session would block every later start_workout with
    // "a workout is already in progress" — the worst possible failure mode.
    expect(await getActiveWorkout(db, userId)).toBeNull();
  });
});
