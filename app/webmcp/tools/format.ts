import type {
  InsightsView,
  WorkoutDetailView,
  WorkoutSummaryView,
} from "~/domain/types";

import { untrusted } from "../runtime";

/**
 * Prose renderings of the domain objects, for the `content` half of a tool
 * result.
 *
 * Agents get the full object in `structuredContent`; these summaries are what
 * they read back to the person, so they lead with the facts a coach would say
 * out loud rather than restating every field.
 */

export function describeWorkoutSummary(workout: WorkoutSummaryView): string {
  const when = new Date(workout.startedAt).toISOString().slice(0, 10);
  const parts = [
    `${when} — ${workout.title}`,
    `${workout.exerciseCount} exercise(s)`,
    `${workout.completedSets} set(s)`,
  ];
  if (workout.totalVolumeKg > 0) {
    parts.push(`${workout.totalVolumeKg} kg volume`);
  }
  if (workout.durationMinutes !== null) {
    parts.push(`${workout.durationMinutes} min`);
  }
  if (workout.status !== "completed") parts.push(`[${workout.status}]`);
  return parts.join(" · ");
}

export function describeWorkoutDetail(workout: WorkoutDetailView): string {
  const lines = [
    `"${workout.title}" (${workout.status}), started ${workout.startedAt}.`,
  ];

  if (workout.exercises.length === 0) {
    lines.push(
      "No exercises planned yet. This session is an empty template waiting for a plan — call propose_workout_plan to fill it in.",
    );
  }

  for (const entry of workout.exercises) {
    const sets = entry.sets
      .map((set) => {
        const bits = [
          set.weightKg !== null ? `${set.weightKg}kg` : null,
          set.reps !== null ? `${set.reps}r` : null,
          set.rpe !== null ? `@${set.rpe}` : null,
        ].filter(Boolean);
        const marker =
          set.status === "completed"
            ? "✓"
            : set.status === "skipped"
              ? "–"
              : "○";
        return `${marker}${set.setIndex}:${bits.join("/") || "empty"}`;
      })
      .join(" ");

    lines.push(
      `${entry.position + 1}. ${entry.exercise.name} (${entry.exercise.primaryMuscle}, id=${entry.id}) — ${sets}`,
    );
    if (entry.rationale) {
      lines.push(`   ${untrusted("rationale", entry.rationale)}`);
    }
  }

  lines.push(
    `Progress: ${workout.completedSets} set(s) completed, ${workout.totalVolumeKg} kg total volume.`,
  );

  if (workout.notes) {
    lines.push(untrusted("Session notes", workout.notes));
  }

  lines.push(
    "Legend: ✓ completed, ○ pending, – skipped. Use the id= value as workoutExerciseId when logging sets.",
  );

  return lines.join("\n");
}

export function describeInsights(insights: InsightsView): string {
  const lines = [
    `Last ${insights.windowWeeks} weeks: ${insights.totalWorkouts} workout(s), ${insights.totalSets} set(s), ${insights.totalVolumeKg} kg total volume.`,
    `Averaging ${insights.averageSessionsPerWeek} session(s)/week against a target of ${insights.weeklyTargetSessions}.`,
  ];

  if (insights.currentStreakWeeks > 0) {
    lines.push(
      `On a ${insights.currentStreakWeeks}-week streak of hitting that target.`,
    );
  }

  if (insights.daysSinceLastWorkout !== null) {
    lines.push(`Last trained ${insights.daysSinceLastWorkout} day(s) ago.`);
  } else {
    lines.push("No completed workouts yet.");
  }

  if (insights.muscleGroupLoad.length > 0) {
    lines.push(
      `Load by muscle group: ${insights.muscleGroupLoad
        .map(
          (item) =>
            `${item.muscleGroup} ${item.sets} set(s)${
              item.daysSinceLastTrained !== null
                ? ` (${item.daysSinceLastTrained}d ago)`
                : ""
            }`,
        )
        .join(", ")}.`,
    );
  }

  if (insights.underworkedMuscleGroups.length > 0) {
    lines.push(
      `Least recently trained, and the natural target for the next session: ${insights.underworkedMuscleGroups.join(", ")}.`,
    );
  }

  if (insights.personalRecords.length > 0) {
    lines.push(
      `Best estimated 1RMs: ${insights.personalRecords
        .slice(0, 5)
        .map(
          (record) =>
            `${record.exerciseName} ${record.estimatedOneRepMaxKg}kg (from ${record.bestWeightKg}kg x ${record.bestReps})`,
        )
        .join(", ")}.`,
    );
  }

  return lines.join("\n");
}

/** Renders a proposed plan as the review list shown in the confirm dialog. */
/**
 * Turns a catalog id into something a person can read.
 *
 * Agents are told to pass `exerciseId` rather than a name, because an id is
 * unambiguous — which left the approval dialog listing `barbell-bench-press`.
 * That dialog is where someone actually consents to a session, so it has to be
 * legible.
 *
 * Shared catalog ids are slugs derived from the exercise name (see
 * scripts/gen-seed.mjs), so reversing the slug reproduces the name exactly. An
 * id that is not slug-shaped — a custom exercise keyed by uuid — is left alone
 * rather than mangled into nonsense.
 */
function readableExerciseId(id: string | undefined): string | undefined {
  if (!id) return undefined;
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id)) return id;
  // A uuid is lowercase and hyphenated too; its long hex runs give it away.
  if (/[0-9a-f]{8,}/.test(id)) return id;

  return id
    .split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

export function describePlanForReview(
  exercises: Array<{
    exerciseId?: string | undefined;
    exerciseName?: string | undefined;
    sets: Array<{
      reps?: number | undefined;
      weightKg?: number | undefined;
      rpe?: number | undefined;
      isWarmup?: boolean;
    }>;
  }>,
): string[] {
  return exercises.map((entry) => {
    const label =
      entry.exerciseName ?? readableExerciseId(entry.exerciseId) ?? "Exercise";
    const sets = entry.sets
      .map((set) => {
        const bits = [
          set.weightKg !== undefined ? `${set.weightKg}kg` : null,
          set.reps !== undefined ? `${set.reps} reps` : null,
          set.rpe !== undefined ? `RPE ${set.rpe}` : null,
        ].filter(Boolean);
        return (
          (set.isWarmup ? "warmup " : "") +
          (bits.join(" x ") || "as prescribed")
        );
      })
      .join(", ");
    return `${label} — ${entry.sets.length} set(s): ${sets}`;
  });
}
