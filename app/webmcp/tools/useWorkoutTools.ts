import { useRevalidator } from "react-router";

import {
  addExerciseInput,
  addNoteInput,
  cancelWorkoutInput,
  finishWorkoutInput,
  logSetInput,
  proposePlanInput,
  removeExerciseInput,
} from "~/domain/contracts";
import type { WorkoutDetailView } from "~/domain/types";
import { apiFetch } from "~/lib/api-client";

import { useWebMcp } from "../provider";
import { toolError, toolOk } from "../runtime";
import { useWebMcpTool } from "../use-tool";
import { describePlanForReview, describeWorkoutDetail } from "./format";

/**
 * Tools that edit the session the person is currently looking at.
 *
 * Registered only while the workout page is mounted, so the agent's tool list
 * mirrors what the human can see and act on. That scoping is the point: an
 * agent cannot log sets into a workout that is not on screen, which keeps the
 * two of them working on the same thing.
 */
export function useWorkoutTools(workout: WorkoutDetailView) {
  const revalidator = useRevalidator();
  const { requestConfirmation } = useWebMcp();

  const isEditable = workout.status === "active";
  const workoutPath = `/api/workouts/${encodeURIComponent(workout.id)}`;

  /** Applies a command, then re-runs the loader so the UI reflects it. */
  const command = async (body: Record<string, unknown>) => {
    const updated = await apiFetch<WorkoutDetailView>(workoutPath, {
      method: "POST",
      body,
      actor: "agent",
    });
    await revalidator.revalidate();
    return updated;
  };

  useWebMcpTool(
    {
      name: "propose_workout_plan",
      title: "Suggest a workout",
      description:
        "Fills the open session with a suggested plan: exercises in order, each with its sets, target reps, loads in kilograms and optional RPE. The person sees the whole plan and approves or rejects it before anything is written. Call get_training_insights and search_exercises first so the plan reflects what they have actually been lifting. This replaces any existing plan, and is refused once sets have been logged.",
      schema: proposePlanInput,
      annotations: {
        readOnlyHint: false,
        // Replaces the existing plan wholesale.
        destructiveHint: true,
        idempotentHint: false,
      },
      activityLabel: (args) =>
        `Suggested a ${args.exercises.length}-exercise workout`,
      execute: async (args, client) => {
        if (args.workoutId !== workout.id) {
          return toolError(
            `This page is showing workout ${workout.id}, not ${args.workoutId}. Call get_active_workout to get the right id.`,
            "wrong_workout",
          );
        }
        if (!isEditable) {
          return toolError(
            `This workout is ${workout.status} and can no longer be changed. Call start_workout to begin a new one.`,
            "workout_not_active",
          );
        }

        // The plan is the agent's main creative act, so the person reviews it
        // in full — exercise by exercise — before it lands on the page.
        const approved = await requestConfirmation(
          {
            toolName: "propose_workout_plan",
            title: args.title ? `Use "${args.title}"?` : "Use this plan?",
            description:
              "Your agent put together the workout below. Nothing is saved until you accept it.",
            details: describePlanForReview(args.exercises),
            confirmLabel: "Use this plan",
            tone: "neutral",
          },
          client,
        );

        if (!approved) {
          return toolError(
            "The person rejected the plan. Ask what they would change — the load, the exercise selection, or the volume — before proposing another.",
            "user_declined",
          );
        }

        const updated = await command({ ...args, op: "propose_plan" });
        return toolOk(
          `Plan accepted and loaded into the page.\n${describeWorkoutDetail(updated)}`,
          updated,
        );
      },
    },
    { enabled: isEditable },
  );

  useWebMcpTool(
    {
      name: "log_set",
      title: "Log a set",
      description:
        "Records one set as completed or skipped. setIndex is 1-based within that exercise; omitted fields fall back to the planned values, so logging a set that went to plan needs only the ids and the index. You may log one past the planned count to record an extra set. This is the tool you will call most during a session, and it does not ask for confirmation — the person is watching the page update.",
      schema: logSetInput,
      annotations: {
        readOnlyHint: false,
        // Re-logging the same setIndex overwrites rather than appends.
        idempotentHint: true,
      },
      activityLabel: (args) =>
        args.status === "skipped"
          ? `Skipped set ${args.setIndex}`
          : `Logged set ${args.setIndex}${args.weightKg !== undefined ? ` at ${args.weightKg}kg` : ""}`,
      execute: async (args) => {
        if (args.workoutId !== workout.id) {
          return toolError(
            `This page is showing workout ${workout.id}. Call get_active_workout to re-sync.`,
            "wrong_workout",
          );
        }
        if (!isEditable) {
          return toolError(
            `This workout is ${workout.status}; sets can no longer be logged against it.`,
            "workout_not_active",
          );
        }

        const updated = await apiFetch<WorkoutDetailView>(
          `${workoutPath}/sets`,
          { method: "POST", body: args, actor: "agent" },
        );
        await revalidator.revalidate();

        const entry = updated.exercises.find(
          (candidate) => candidate.id === args.workoutExerciseId,
        );
        const remaining =
          entry?.sets.filter((set) => set.status === "pending").length ?? 0;

        return toolOk(
          `Logged set ${args.setIndex} of ${entry?.exercise.name ?? "the exercise"}. ${
            remaining > 0
              ? `${remaining} set(s) left on this exercise.`
              : "That exercise is done."
          }`,
          updated,
        );
      },
    },
    { enabled: isEditable },
  );

  useWebMcpTool(
    {
      name: "add_exercise_to_workout",
      title: "Add an exercise",
      description:
        "Appends an exercise (or inserts it at a position) to the open session without disturbing what is already logged. Use this to extend a workout mid-session — for example when the person wants one more movement, or a machine they wanted is occupied and you are substituting.",
      schema: addExerciseInput,
      annotations: { readOnlyHint: false, idempotentHint: false },
      activityLabel: (args) =>
        `Added ${args.exerciseName ?? "an exercise"} to the workout`,
      execute: async (args, client) => {
        if (args.workoutId !== workout.id) {
          return toolError(
            `This page is showing workout ${workout.id}.`,
            "wrong_workout",
          );
        }
        if (!isEditable) {
          return toolError(
            `This workout is ${workout.status} and can no longer be changed.`,
            "workout_not_active",
          );
        }

        const approved = await requestConfirmation(
          {
            toolName: "add_exercise_to_workout",
            title: "Add this exercise?",
            description: "Your agent wants to extend the current session.",
            details: describePlanForReview([args]),
            confirmLabel: "Add it",
            tone: "neutral",
          },
          client,
        );

        if (!approved) {
          return toolError(
            "The person declined to add that exercise.",
            "user_declined",
          );
        }

        const updated = await command({ ...args, op: "add_exercise" });
        return toolOk(
          `Added it. The session now has ${updated.exercises.length} exercise(s).`,
          updated,
        );
      },
    },
    { enabled: isEditable },
  );

  useWebMcpTool(
    {
      name: "remove_exercise_from_workout",
      title: "Remove an exercise",
      description:
        "Drops an exercise from the open session, along with any sets recorded against it. Pass the workoutExerciseId from get_active_workout, not the catalog exercise id.",
      schema: removeExerciseInput,
      annotations: { readOnlyHint: false, destructiveHint: true },
      activityLabel: () => "Removed an exercise",
      execute: async (args, client) => {
        if (args.workoutId !== workout.id) {
          return toolError(
            `This page is showing workout ${workout.id}.`,
            "wrong_workout",
          );
        }
        if (!isEditable) {
          return toolError(
            `This workout is ${workout.status} and can no longer be changed.`,
            "workout_not_active",
          );
        }

        const target = workout.exercises.find(
          (entry) => entry.id === args.workoutExerciseId,
        );
        const logged =
          target?.sets.filter((set) => set.status === "completed").length ?? 0;

        const approved = await requestConfirmation(
          {
            toolName: "remove_exercise_from_workout",
            title: `Remove ${target?.exercise.name ?? "this exercise"}?`,
            description:
              logged > 0
                ? `This will also discard ${logged} set(s) you already logged.`
                : "It has no logged sets, so nothing recorded will be lost.",
            confirmLabel: "Remove it",
            tone: logged > 0 ? "danger" : "neutral",
          },
          client,
        );

        if (!approved) {
          return toolError(
            "The person declined to remove that exercise.",
            "user_declined",
          );
        }

        const updated = await command({ ...args, op: "remove_exercise" });
        return toolOk(
          `Removed it. ${updated.exercises.length} exercise(s) remain.`,
          updated,
        );
      },
    },
    { enabled: isEditable },
  );

  useWebMcpTool(
    {
      name: "add_workout_note",
      title: "Add a note",
      description:
        "Appends a line to the session's notes — how a lift felt, a niggle to watch, a cue that worked. Notes are shown to the person and are visible to you on later sessions via get_workout, so this is how coaching context carries forward.",
      schema: addNoteInput,
      annotations: { readOnlyHint: false, idempotentHint: false },
      activityLabel: () => "Added a note",
      execute: async (args) => {
        if (args.workoutId !== workout.id) {
          return toolError(
            `This page is showing workout ${workout.id}.`,
            "wrong_workout",
          );
        }
        if (!isEditable) {
          return toolError(
            `This workout is ${workout.status} and can no longer be changed.`,
            "workout_not_active",
          );
        }

        const updated = await command({ ...args, op: "add_note" });
        return toolOk("Note added to the session.", updated);
      },
    },
    { enabled: isEditable },
  );

  useWebMcpTool(
    {
      name: "finish_workout",
      title: "Finish the workout",
      description:
        "Closes out the session: any set still pending is marked skipped, the duration is fixed, and the workout moves into history where it starts counting toward insights. Confirm with the person that they are actually done before calling this — it cannot be undone.",
      schema: finishWorkoutInput,
      annotations: { readOnlyHint: false, destructiveHint: true },
      activityLabel: () => "Finished the workout",
      execute: async (args, client) => {
        if (args.workoutId !== workout.id) {
          return toolError(
            `This page is showing workout ${workout.id}.`,
            "wrong_workout",
          );
        }
        if (!isEditable) {
          return toolError(
            `This workout is already ${workout.status}.`,
            "workout_not_active",
          );
        }

        const pending = workout.exercises
          .flatMap((entry) => entry.sets)
          .filter((set) => set.status === "pending").length;

        const approved = await requestConfirmation(
          {
            toolName: "finish_workout",
            title: "Finish this workout?",
            description:
              pending > 0
                ? `${pending} set(s) are still pending and will be marked skipped. This cannot be undone.`
                : "Every set is accounted for. This cannot be undone.",
            confirmLabel: "Finish workout",
            tone: "danger",
          },
          client,
        );

        if (!approved) {
          return toolError(
            "The person is not finished yet. Keep logging sets.",
            "user_declined",
          );
        }

        const updated = await command({ ...args, op: "finish" });
        return toolOk(
          `Finished "${updated.title}": ${updated.completedSets} set(s), ${updated.totalVolumeKg} kg total volume${
            updated.durationMinutes !== null
              ? `, ${updated.durationMinutes} minutes`
              : ""
          }.`,
          updated,
        );
      },
    },
    { enabled: isEditable },
  );

  useWebMcpTool(
    {
      name: "cancel_workout",
      title: "Discard the workout",
      description:
        "Abandons the session without recording it as training. Use this when the person stops early and does not want it counted. Prefer finish_workout whenever they did any real work — an abandoned session is excluded from insights entirely.",
      schema: cancelWorkoutInput,
      annotations: { readOnlyHint: false, destructiveHint: true },
      activityLabel: () => "Discarded the workout",
      execute: async (args, client) => {
        if (args.workoutId !== workout.id) {
          return toolError(
            `This page is showing workout ${workout.id}.`,
            "wrong_workout",
          );
        }
        if (!isEditable) {
          return toolError(
            `This workout is already ${workout.status}.`,
            "workout_not_active",
          );
        }

        const logged = workout.completedSets;
        const approved = await requestConfirmation(
          {
            toolName: "cancel_workout",
            title: "Discard this workout?",
            description:
              logged > 0
                ? `${logged} logged set(s) will not count toward your training history. This cannot be undone.`
                : "Nothing has been logged, so nothing will be lost.",
            confirmLabel: "Discard it",
            tone: "danger",
          },
          client,
        );

        if (!approved) {
          return toolError(
            "The person chose to keep the workout.",
            "user_declined",
          );
        }

        const updated = await command({ ...args, op: "cancel" });
        return toolOk(`Discarded "${updated.title}".`, updated);
      },
    },
    { enabled: isEditable },
  );
}
