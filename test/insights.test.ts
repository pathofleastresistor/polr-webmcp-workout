import { beforeEach, describe, expect, it } from "vitest";

import type { Database } from "~/db";
import type { UserProfile } from "~/db/schema";
import {
  computeStreakWeeks,
  estimateOneRepMax,
  getInsights,
} from "~/server/services/insights.server";
import {
  finishWorkout,
  logSet,
  replacePlan,
  startWorkout,
} from "~/server/services/workouts.server";

import { createUser, seedExercises, testDb } from "./helpers";

const DAY = 86_400_000;
const WEEK = DAY * 7;

describe("estimateOneRepMax", () => {
  it("uses the Epley formula", () => {
    expect(estimateOneRepMax(100, 1)).toBeCloseTo(103.3, 1);
    expect(estimateOneRepMax(100, 5)).toBeCloseTo(116.7, 1);
  });

  it("declines to estimate where the formula breaks down", () => {
    // Above ~12 reps Epley overestimates badly, so no number is better than a
    // wrong one an agent would then program against.
    expect(estimateOneRepMax(60, 20)).toBeNull();
    expect(estimateOneRepMax(null, 5)).toBeNull();
    expect(estimateOneRepMax(100, null)).toBeNull();
    expect(estimateOneRepMax(0, 5)).toBeNull();
  });
});

describe("computeStreakWeeks", () => {
  const now = Date.UTC(2026, 5, 15);

  it("counts consecutive weeks that met the target", () => {
    const times = [
      now - DAY,
      now - 2 * DAY,
      now - WEEK - DAY,
      now - WEEK - 2 * DAY,
      now - 2 * WEEK - DAY,
      now - 2 * WEEK - 2 * DAY,
    ];
    expect(computeStreakWeeks(times, now, 2)).toBe(3);
  });

  it("does not break the streak on an unfinished current week", () => {
    // Only one session so far this week against a target of three — the streak
    // from previous weeks should survive until the week actually ends.
    const times = [
      now - DAY,
      now - WEEK - DAY,
      now - WEEK - 2 * DAY,
      now - WEEK - 3 * DAY,
    ];
    expect(computeStreakWeeks(times, now, 3)).toBe(1);
  });

  it("stops at the first past week that missed the target", () => {
    const times = [now - DAY, now - 2 * WEEK - DAY];
    expect(computeStreakWeeks(times, now, 1)).toBe(1);
  });

  it("is zero with no history", () => {
    expect(computeStreakWeeks([], now, 3)).toBe(0);
  });
});

describe("getInsights", () => {
  let db: Database;
  let userId: string;
  let profile: UserProfile;

  beforeEach(async () => {
    db = testDb();
    await seedExercises(db);
    const created = await createUser(db);
    userId = created.id;
    profile = created.profile;
  });

  it("attributes load to primary and secondary muscles", async () => {
    const started = await startWorkout(db, userId, {}, "human");
    const planned = await replacePlan(
      db,
      userId,
      {
        workoutId: started.id,
        exercises: [
          {
            // Primary chest, secondary triceps.
            exerciseId: "bench-press",
            sets: [{ weightKg: 80, reps: 5, isWarmup: false }],
          },
        ],
      },
      "agent",
    );

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
    await finishWorkout(db, userId, { workoutId: started.id });

    const insights = await getInsights(db, userId, profile, { weeks: 8 });

    expect(insights.totalWorkouts).toBe(1);
    expect(insights.totalSets).toBe(1);
    expect(insights.totalVolumeKg).toBe(400);

    const chest = insights.muscleGroupLoad.find(
      (item) => item.muscleGroup === "chest",
    );
    const triceps = insights.muscleGroupLoad.find(
      (item) => item.muscleGroup === "triceps",
    );

    expect(chest?.sets).toBe(1);
    expect(chest?.volumeKg).toBe(400);
    // Secondary movers get half credit.
    expect(triceps?.sets).toBe(0.5);
    expect(triceps?.volumeKg).toBe(200);
  });

  it("ignores abandoned and in-progress sessions", async () => {
    const started = await startWorkout(db, userId, {}, "human");
    const planned = await replacePlan(
      db,
      userId,
      {
        workoutId: started.id,
        exercises: [
          {
            exerciseId: "back-squat",
            sets: [{ weightKg: 100, reps: 5, isWarmup: false }],
          },
        ],
      },
      "agent",
    );
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

    // Still active — nothing should count yet.
    const before = await getInsights(db, userId, profile, { weeks: 8 });
    expect(before.totalWorkouts).toBe(0);
    expect(before.totalVolumeKg).toBe(0);

    await finishWorkout(db, userId, { workoutId: started.id });

    const after = await getInsights(db, userId, profile, { weeks: 8 });
    expect(after.totalWorkouts).toBe(1);
    expect(after.totalVolumeKg).toBe(500);
    expect(after.personalRecords[0]?.exerciseName).toBe("Back Squat");
  });

  it("reports an empty but well-formed summary for a new account", async () => {
    const insights = await getInsights(db, userId, profile, { weeks: 4 });

    expect(insights.totalWorkouts).toBe(0);
    expect(insights.lastWorkoutAt).toBeNull();
    expect(insights.daysSinceLastWorkout).toBeNull();
    expect(insights.muscleGroupLoad).toEqual([]);
    expect(insights.underworkedMuscleGroups).toEqual([]);
    expect(insights.personalRecords).toEqual([]);
  });

  it("scopes insights to the requesting user", async () => {
    const other = await createUser(db);

    const started = await startWorkout(db, other.id, {}, "human");
    const planned = await replacePlan(
      db,
      other.id,
      {
        workoutId: started.id,
        exercises: [
          {
            exerciseId: "back-squat",
            sets: [{ weightKg: 100, reps: 5, isWarmup: false }],
          },
        ],
      },
      "agent",
    );
    await logSet(
      db,
      other.id,
      {
        workoutId: started.id,
        workoutExerciseId: planned.exercises[0]!.id,
        setIndex: 1,
        status: "completed",
      },
      "human",
    );
    await finishWorkout(db, other.id, { workoutId: started.id });

    expect(
      (await getInsights(db, userId, profile, { weeks: 8 })).totalWorkouts,
    ).toBe(0);
  });
});
