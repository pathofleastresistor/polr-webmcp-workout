import type { Database } from "~/db";
import {
  exercise,
  userProfile,
  workout,
  workoutExercise,
  workoutSet,
  type MuscleGroup,
} from "~/db/schema";

import { newId } from "./ids";

const DAY_MS = 86_400_000;

/**
 * A four-day rotation, so eight weeks of generated history produces the muscle
 * group imbalances and progression that make the insights page worth looking at.
 * The exercises are created for the demo user as part of seeding, the same way
 * a real person's library is built from what they train — there is no shared
 * catalog to draw on.
 */
const ROTATION: Array<{
  title: string;
  entries: Array<{
    exerciseId: string;
    sets: number;
    reps: number;
    startKg: number;
    stepKg: number;
  }>;
}> = [
  {
    title: "Upper push",
    entries: [
      {
        exerciseId: "barbell-bench-press",
        sets: 4,
        reps: 6,
        startKg: 70,
        stepKg: 2.5,
      },
      {
        exerciseId: "overhead-press",
        sets: 3,
        reps: 8,
        startKg: 40,
        stepKg: 1.25,
      },
      {
        exerciseId: "incline-dumbbell-press",
        sets: 3,
        reps: 10,
        startKg: 24,
        stepKg: 1,
      },
      {
        exerciseId: "triceps-pushdown",
        sets: 3,
        reps: 12,
        startKg: 30,
        stepKg: 1.25,
      },
    ],
  },
  {
    title: "Lower",
    entries: [
      { exerciseId: "back-squat", sets: 4, reps: 5, startKg: 90, stepKg: 2.5 },
      {
        exerciseId: "romanian-deadlift",
        sets: 3,
        reps: 8,
        startKg: 70,
        stepKg: 2.5,
      },
      { exerciseId: "leg-press", sets: 3, reps: 12, startKg: 140, stepKg: 5 },
      {
        exerciseId: "standing-calf-raise",
        sets: 3,
        reps: 15,
        startKg: 50,
        stepKg: 2.5,
      },
    ],
  },
  {
    title: "Upper pull",
    entries: [
      { exerciseId: "barbell-row", sets: 4, reps: 8, startKg: 60, stepKg: 2.5 },
      {
        exerciseId: "lat-pulldown",
        sets: 3,
        reps: 10,
        startKg: 55,
        stepKg: 2.5,
      },
      { exerciseId: "face-pull", sets: 3, reps: 15, startKg: 20, stepKg: 1 },
      {
        exerciseId: "barbell-curl",
        sets: 3,
        reps: 10,
        startKg: 30,
        stepKg: 1.25,
      },
    ],
  },
  {
    title: "Full body",
    entries: [
      { exerciseId: "deadlift", sets: 3, reps: 5, startKg: 110, stepKg: 5 },
      { exerciseId: "goblet-squat", sets: 3, reps: 12, startKg: 28, stepKg: 2 },
      { exerciseId: "plank", sets: 3, reps: 1, startKg: 0, stepKg: 0 },
    ],
  },
];

/**
 * Fills a fresh demo account with eight weeks of plausible training.
 *
 * Without this the dashboard, the insights page and every read tool return
 * empty results, which is the least interesting version of the product — the
 * whole point is an agent reasoning over real history.
 *
 * Deliberately deterministic apart from the start time: reproducible demos are
 * easier to talk about than randomised ones.
 */
/**
 * The movements the rotation above uses.
 *
 * Created per demo user rather than read from a catalog, because there is no
 * catalog: an exercise belongs to the person who trains it. The muscle
 * attribution is what makes the insights page worth looking at, so it is set
 * deliberately rather than defaulted.
 */
const DEMO_EXERCISES: Array<{
  slug: string;
  name: string;
  primaryMuscle: MuscleGroup;
  secondaryMuscles: MuscleGroup[];
  equipment: string;
}> = [
  {
    slug: "barbell-bench-press",
    name: "Barbell Bench Press",
    primaryMuscle: "chest",
    secondaryMuscles: ["triceps", "shoulders"],
    equipment: "barbell",
  },
  {
    slug: "incline-dumbbell-press",
    name: "Incline Dumbbell Press",
    primaryMuscle: "chest",
    secondaryMuscles: ["shoulders", "triceps"],
    equipment: "dumbbell",
  },
  {
    slug: "overhead-press",
    name: "Overhead Press",
    primaryMuscle: "shoulders",
    secondaryMuscles: ["triceps", "core"],
    equipment: "barbell",
  },
  {
    slug: "triceps-pushdown",
    name: "Triceps Pushdown",
    primaryMuscle: "triceps",
    secondaryMuscles: [],
    equipment: "cable",
  },
  {
    slug: "back-squat",
    name: "Back Squat",
    primaryMuscle: "quads",
    secondaryMuscles: ["glutes", "hamstrings", "core"],
    equipment: "barbell",
  },
  {
    slug: "romanian-deadlift",
    name: "Romanian Deadlift",
    primaryMuscle: "hamstrings",
    secondaryMuscles: ["glutes", "back"],
    equipment: "barbell",
  },
  {
    slug: "leg-press",
    name: "Leg Press",
    primaryMuscle: "quads",
    secondaryMuscles: ["glutes"],
    equipment: "machine",
  },
  {
    slug: "standing-calf-raise",
    name: "Standing Calf Raise",
    primaryMuscle: "calves",
    secondaryMuscles: [],
    equipment: "machine",
  },
  {
    slug: "barbell-row",
    name: "Barbell Row",
    primaryMuscle: "back",
    secondaryMuscles: ["biceps"],
    equipment: "barbell",
  },
  {
    slug: "lat-pulldown",
    name: "Lat Pulldown",
    primaryMuscle: "back",
    secondaryMuscles: ["biceps"],
    equipment: "cable",
  },
  {
    slug: "face-pull",
    name: "Face Pull",
    primaryMuscle: "back",
    secondaryMuscles: ["shoulders"],
    equipment: "cable",
  },
  {
    slug: "barbell-curl",
    name: "Barbell Curl",
    primaryMuscle: "biceps",
    secondaryMuscles: [],
    equipment: "barbell",
  },
  {
    slug: "deadlift",
    name: "Deadlift",
    primaryMuscle: "back",
    secondaryMuscles: ["hamstrings", "glutes", "core"],
    equipment: "barbell",
  },
  {
    slug: "goblet-squat",
    name: "Goblet Squat",
    primaryMuscle: "quads",
    secondaryMuscles: ["glutes", "core"],
    equipment: "dumbbell",
  },
  {
    slug: "plank",
    name: "Plank",
    primaryMuscle: "core",
    secondaryMuscles: [],
    equipment: "bodyweight",
  },
];

export async function seedDemoData(
  db: Database,
  userId: string,
  now = Date.now(),
): Promise<void> {
  // Build this person's library first; the history below is recorded against
  // it. Ids are generated per user, so the rotation's slugs are mapped to them.
  const exerciseIds = new Map<string, string>();
  const exerciseRows = DEMO_EXERCISES.map((definition) => {
    const id = newId();
    exerciseIds.set(definition.slug, id);
    return {
      id,
      slug: definition.slug,
      name: definition.name,
      primaryMuscle: definition.primaryMuscle,
      secondaryMuscles: definition.secondaryMuscles,
      equipment: definition.equipment,
      modality: "strength" as const,
      isUnilateral: false,
      createdBy: userId,
      createdAt: new Date(now),
    };
  });

  const profileValues = {
    isDemo: true,
    goal: "Get back to a 100 kg bench without aggravating my left shoulder.",
    experienceLevel: "intermediate" as const,
    weeklyTargetSessions: 3,
    updatedAt: new Date(now),
  };

  const statements: { run: () => unknown }[] = [
    // Must precede the history below: workout_exercise references these rows.
    db.insert(exercise).values(exerciseRows),
    // Upsert, not update: the profile row is normally created lazily on the
    // first authenticated request, which has not happened yet at this point.
    // An UPDATE here would silently match zero rows and leave `isDemo` false,
    // which is what revocation depends on.
    db
      .insert(userProfile)
      .values({ userId, ...profileValues })
      .onConflictDoUpdate({
        target: userProfile.userId,
        set: profileValues,
      }),
  ];

  // Eight weeks, three sessions a week, walking forward through the rotation.
  let sessionIndex = 0;
  for (let weeksAgo = 7; weeksAgo >= 0; weeksAgo--) {
    for (const dayOffset of [0, 2, 4]) {
      const startedAt = new Date(
        now - weeksAgo * 7 * DAY_MS + dayOffset * DAY_MS - 5 * DAY_MS,
      );
      // Don't generate sessions in the future for the current week.
      if (startedAt.getTime() > now) continue;

      const day = ROTATION[sessionIndex % ROTATION.length]!;
      const cycle = Math.floor(sessionIndex / ROTATION.length);
      sessionIndex += 1;

      const entries = day.entries.filter((entry) =>
        exerciseIds.has(entry.exerciseId),
      );
      // A rotation day whose exercises are all absent from the catalog is
      // skipped outright — never persisted as a workout with nothing in it.
      if (entries.length === 0) continue;

      const workoutId = newId();
      const durationMinutes = 48 + (sessionIndex % 5) * 3;

      statements.push(
        db.insert(workout).values({
          id: workoutId,
          userId,
          title: day.title,
          status: "completed",
          plannedBy: sessionIndex % 3 === 0 ? "agent" : "human",
          startedAt,
          completedAt: new Date(startedAt.getTime() + durationMinutes * 60_000),
          createdAt: startedAt,
          updatedAt: startedAt,
        }),
      );

      let position = 0;
      for (const entry of entries) {
        const workoutExerciseId = newId();
        // Linear progression across cycles — enough for the 1RM estimates and
        // the volume trend to move in the right direction.
        const weightKg = entry.startKg + cycle * entry.stepKg;

        statements.push(
          db.insert(workoutExercise).values({
            id: workoutExerciseId,
            workoutId,
            exerciseId: exerciseIds.get(entry.exerciseId)!,
            position,
            targetSets: entry.sets,
            targetReps: entry.reps,
            targetWeightKg: weightKg || null,
            createdAt: startedAt,
          }),
        );
        position += 1;

        for (let setIndex = 1; setIndex <= entry.sets; setIndex++) {
          // The last set of the day drops a rep — realistic, and it stops every
          // estimated 1RM from landing on a suspiciously round number.
          const reps =
            setIndex === entry.sets && entry.reps > 3
              ? entry.reps - 1
              : entry.reps;

          statements.push(
            db.insert(workoutSet).values({
              id: newId(),
              workoutExerciseId,
              setIndex,
              weightKg: weightKg || null,
              reps,
              isWarmup: false,
              status: "completed",
              loggedBy: sessionIndex % 3 === 0 ? "agent" : "human",
              completedAt: new Date(
                startedAt.getTime() + setIndex * 3 * 60_000,
              ),
              createdAt: startedAt,
            }),
          );
        }
      }
    }
  }

  // Previously chunked, because D1 capped how much one batch could carry. A
  // local transaction has no such limit, so the whole seed lands atomically:
  // a visitor never sees a half-populated history.
  db.transaction(() => {
    for (const statement of statements) statement.run();
  });
}
