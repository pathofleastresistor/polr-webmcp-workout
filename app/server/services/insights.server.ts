import { and, desc, eq, gte } from "drizzle-orm";

import type { Database } from "~/db";
import type { MuscleGroup, UserProfile } from "~/db/schema";
import { workout, workoutExercise, workoutSet } from "~/db/schema";
import type {
  InsightsView,
  MuscleGroupLoad,
  PersonalRecord,
} from "~/domain/types";

import type { InsightsInput } from "./service-inputs";

const DAY_MS = 86_400_000;
const WEEK_MS = DAY_MS * 7;

/**
 * Aggregates recent training into the shape an agent needs to program a good
 * next session: what has been trained, how hard, how recently, and where the
 * gaps are.
 *
 * Computed in the Worker rather than in SQL because the window is small
 * (bounded by `weeks`) and the per-muscle attribution needs the secondary
 * muscle list, which is stored as JSON.
 */
export async function getInsights(
  db: Database,
  userId: string,
  profile: UserProfile,
  input: InsightsInput,
): Promise<InsightsView> {
  const now = Date.now();
  const windowStart = new Date(now - input.weeks * WEEK_MS);

  const rows = await db.query.workout.findMany({
    where: and(
      eq(workout.userId, userId),
      eq(workout.status, "completed"),
      gte(workout.startedAt, windowStart),
    ),
    orderBy: desc(workout.startedAt),
    with: {
      exercises: { with: { sets: true, exercise: true } },
    },
  });

  const loadByMuscle = new Map<
    MuscleGroup,
    { sets: number; volumeKg: number; lastTrainedAt: number | null }
  >();
  const bestByExercise = new Map<string, PersonalRecord>();

  let totalSets = 0;
  let totalVolumeKg = 0;

  for (const session of rows) {
    const sessionTime = session.startedAt.getTime();

    for (const entry of session.exercises) {
      for (const set of entry.sets) {
        if (set.status !== "completed") continue;
        totalSets += 1;

        const volume =
          !set.isWarmup && set.weightKg !== null && set.reps !== null
            ? set.weightKg * set.reps
            : 0;
        totalVolumeKg += volume;

        // A set loads its primary muscle fully and each secondary at half.
        // Crude, but it is the standard heuristic and it is consistent, which
        // is what matters for spotting neglected groups.
        accumulate(
          loadByMuscle,
          entry.exercise.primaryMuscle,
          1,
          volume,
          sessionTime,
        );
        for (const secondary of entry.exercise.secondaryMuscles ?? []) {
          accumulate(loadByMuscle, secondary, 0.5, volume / 2, sessionTime);
        }

        trackPersonalRecord(bestByExercise, {
          exerciseId: entry.exercise.id,
          exerciseName: entry.exercise.name,
          weightKg: set.weightKg,
          reps: set.reps,
          at: set.completedAt ?? session.startedAt,
        });
      }
    }
  }

  const muscleGroupLoad: MuscleGroupLoad[] = [...loadByMuscle.entries()]
    .map(([muscleGroup, value]) => ({
      muscleGroup,
      sets: Math.round(value.sets * 10) / 10,
      volumeKg: Math.round(value.volumeKg),
      daysSinceLastTrained:
        value.lastTrainedAt === null
          ? null
          : Math.floor((now - value.lastTrainedAt) / DAY_MS),
    }))
    .sort((a, b) => b.volumeKg - a.volumeKg);

  const lastWorkout = rows[0] ?? null;

  return {
    windowWeeks: input.weeks,
    totalWorkouts: rows.length,
    totalSets,
    totalVolumeKg: Math.round(totalVolumeKg),
    averageSessionsPerWeek: Math.round((rows.length / input.weeks) * 10) / 10,
    weeklyTargetSessions: profile.weeklyTargetSessions,
    currentStreakWeeks: computeStreakWeeks(
      rows.map((row) => row.startedAt.getTime()),
      now,
      profile.weeklyTargetSessions,
    ),
    lastWorkoutAt: lastWorkout?.startedAt.toISOString() ?? null,
    daysSinceLastWorkout: lastWorkout
      ? Math.floor((now - lastWorkout.startedAt.getTime()) / DAY_MS)
      : null,
    muscleGroupLoad,
    underworkedMuscleGroups: findUnderworked(muscleGroupLoad),
    personalRecords: [...bestByExercise.values()]
      .sort(
        (a, b) => (b.estimatedOneRepMaxKg ?? 0) - (a.estimatedOneRepMaxKg ?? 0),
      )
      .slice(0, 10),
  };
}

function accumulate(
  map: Map<
    MuscleGroup,
    { sets: number; volumeKg: number; lastTrainedAt: number | null }
  >,
  muscleGroup: MuscleGroup,
  sets: number,
  volumeKg: number,
  trainedAt: number,
) {
  const current = map.get(muscleGroup) ?? {
    sets: 0,
    volumeKg: 0,
    lastTrainedAt: null,
  };

  map.set(muscleGroup, {
    sets: current.sets + sets,
    volumeKg: current.volumeKg + volumeKg,
    lastTrainedAt: Math.max(current.lastTrainedAt ?? 0, trainedAt),
  });
}

/**
 * Epley estimate (`w * (1 + reps/30)`) so heavy-low-rep and light-high-rep sets
 * are comparable. Reps above 12 are excluded because the formula degrades badly
 * in that range.
 */
export function estimateOneRepMax(
  weightKg: number | null,
  reps: number | null,
): number | null {
  if (weightKg === null || reps === null) return null;
  if (weightKg <= 0 || reps <= 0 || reps > 12) return null;
  return Math.round(weightKg * (1 + reps / 30) * 10) / 10;
}

function trackPersonalRecord(
  map: Map<string, PersonalRecord>,
  candidate: {
    exerciseId: string;
    exerciseName: string;
    weightKg: number | null;
    reps: number | null;
    at: Date;
  },
) {
  const estimate = estimateOneRepMax(candidate.weightKg, candidate.reps);
  if (estimate === null) return;

  const current = map.get(candidate.exerciseId);
  if (current && (current.estimatedOneRepMaxKg ?? 0) >= estimate) return;

  map.set(candidate.exerciseId, {
    exerciseId: candidate.exerciseId,
    exerciseName: candidate.exerciseName,
    bestWeightKg: candidate.weightKg,
    bestReps: candidate.reps,
    estimatedOneRepMaxKg: estimate,
    achievedAt: candidate.at.toISOString(),
  });
}

/**
 * Consecutive whole weeks, counting back from the current one, in which the
 * user hit their session target. The current week is only counted once the
 * target is met, so an in-progress week never breaks an otherwise live streak.
 */
export function computeStreakWeeks(
  startTimes: number[],
  now: number,
  weeklyTarget: number,
): number {
  if (startTimes.length === 0) return 0;

  const countsByWeek = new Map<number, number>();
  for (const time of startTimes) {
    const weeksAgo = Math.floor((now - time) / WEEK_MS);
    countsByWeek.set(weeksAgo, (countsByWeek.get(weeksAgo) ?? 0) + 1);
  }

  let streak = 0;
  for (let weeksAgo = 0; weeksAgo < 52; weeksAgo++) {
    const count = countsByWeek.get(weeksAgo) ?? 0;
    if (count >= weeklyTarget) {
      streak += 1;
      continue;
    }
    // The current week is still in progress; not hitting the target yet is not
    // a broken streak.
    if (weeksAgo === 0) continue;
    break;
  }

  return streak;
}

/** The groups with the most stale or lowest load — what to program next. */
function findUnderworked(load: MuscleGroupLoad[]): MuscleGroup[] {
  const trainable = load.filter(
    (item) => item.muscleGroup !== "cardio" && item.muscleGroup !== "full_body",
  );
  if (trainable.length === 0) return [];

  return [...trainable]
    .sort((a, b) => {
      const staleA = a.daysSinceLastTrained ?? Number.MAX_SAFE_INTEGER;
      const staleB = b.daysSinceLastTrained ?? Number.MAX_SAFE_INTEGER;
      if (staleA !== staleB) return staleB - staleA;
      return a.volumeKg - b.volumeKg;
    })
    .slice(0, 3)
    .map((item) => item.muscleGroup);
}

/** Recent per-exercise history, so an agent can pick loads that progress. */
export async function getRecentExercisePerformance(
  db: Database,
  userId: string,
  exerciseId: string,
  limit = 5,
): Promise<
  Array<{ performedAt: string; weightKg: number | null; reps: number | null }>
> {
  const rows = await db
    .select({
      startedAt: workout.startedAt,
      weightKg: workoutSet.weightKg,
      reps: workoutSet.reps,
    })
    .from(workoutSet)
    .innerJoin(
      workoutExercise,
      eq(workoutSet.workoutExerciseId, workoutExercise.id),
    )
    .innerJoin(workout, eq(workoutExercise.workoutId, workout.id))
    .where(
      and(
        eq(workout.userId, userId),
        eq(workoutExercise.exerciseId, exerciseId),
        eq(workoutSet.status, "completed"),
        eq(workoutSet.isWarmup, false),
      ),
    )
    .orderBy(desc(workout.startedAt))
    .limit(limit);

  return rows.map((row) => ({
    performedAt: row.startedAt.toISOString(),
    weightKg: row.weightKg,
    reps: row.reps,
  }));
}
