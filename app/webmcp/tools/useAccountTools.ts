import { useNavigate, useRevalidator } from "react-router";
import { z } from "zod";

import {
  getWorkoutInput,
  insightsInput,
  listWorkoutsInput,
  searchExercisesInput,
  startWorkoutInput,
} from "~/domain/contracts";
import type {
  ExerciseView,
  InsightsView,
  ProfileView,
  WorkoutDetailView,
  WorkoutSummaryView,
} from "~/domain/types";
import { apiFetch, buildQuery } from "~/lib/api-client";
import { useLinkPath } from "~/lib/link";

import { useWebMcp } from "../provider";
import { toolError, toolOk, untrusted } from "../runtime";
import { useWebMcpTool } from "../use-tool";
import {
  describeInsights,
  describePlanForReview,
  describeWorkoutDetail,
  describeWorkoutSummary,
} from "./format";

/**
 * Tools available on every page under the person's link.
 *
 * These are the agent's read surface plus the one action that starts a session.
 * Everything that edits a workout lives in `useWorkoutTools`, registered only
 * on the workout page — an agent should not be able to log a set against a
 * session the person is not looking at.
 */
export function useAccountTools() {
  const navigate = useNavigate();
  const linkPath = useLinkPath();
  const revalidator = useRevalidator();
  const { requestConfirmation } = useWebMcp();

  useWebMcpTool({
    name: "whoami",
    title: "Whose page this is",
    description:
      "Returns the person's unit preference, experience level, training goal and weekly session target. Call this first in a session: the unit preference tells you whether to speak in kg or lb, and the goal shapes what you should program.",
    schema: z.object({}),
    annotations: {
      readOnlyHint: true,
      idempotentHint: true,
      // `goal` is free text the person wrote.
      untrustedContentHint: true,
    },
    activityLabel: () => "Read your profile",
    execute: async () => {
      const me = await apiFetch<ProfileView>("/api/me", { actor: "agent" });
      return toolOk(
        [
          `Prefers ${me.unitSystem === "metric" ? "kilograms" : "pounds"}; experience level ${me.experienceLevel}.`,
          `Targets ${me.weeklyTargetSessions} session(s) per week.`,
          untrusted("Stated goal", me.goal),
          "All weights in tool arguments and results are kilograms regardless of this preference — convert only when speaking to the person.",
        ].join("\n"),
        me,
      );
    },
  });

  useWebMcpTool({
    name: "list_workouts",
    title: "List past workouts",
    description:
      "Returns the person's workout history, newest first, with per-session volume, set count and duration. Use it to see what they have been doing before you suggest anything new.",
    schema: listWorkoutsInput,
    annotations: {
      readOnlyHint: true,
      idempotentHint: true,
      untrustedContentHint: true,
    },
    activityLabel: (args) => `Read your last ${args.limit} workouts`,
    execute: async (args) => {
      const result = await apiFetch<{
        workouts: WorkoutSummaryView[];
        active: WorkoutDetailView | null;
      }>(`/api/workouts${buildQuery(args)}`, { actor: "agent" });

      if (result.workouts.length === 0) {
        return toolOk(
          "No workouts match that filter yet. If this is their first session, start_workout creates an empty one you can then plan.",
          result,
        );
      }

      const lines = result.workouts.map(describeWorkoutSummary);
      if (result.active) {
        lines.unshift(
          `In progress right now: "${result.active.title}" (id ${result.active.id}).`,
        );
      }

      return toolOk(lines.join("\n"), result);
    },
  });

  useWebMcpTool({
    name: "get_workout",
    title: "Get one workout",
    description:
      "Returns the full detail of a single workout by id: every exercise, every set, the loads used and any notes. Use it to review exactly what happened in a specific session.",
    schema: getWorkoutInput,
    annotations: {
      readOnlyHint: true,
      idempotentHint: true,
      untrustedContentHint: true,
    },
    activityLabel: () => "Read a past workout",
    execute: async (args) => {
      const workout = await apiFetch<WorkoutDetailView>(
        `/api/workouts/${encodeURIComponent(args.workoutId)}`,
        { actor: "agent" },
      );
      return toolOk(describeWorkoutDetail(workout), workout);
    },
  });

  useWebMcpTool({
    name: "get_training_insights",
    title: "Get training insights",
    description:
      "Summarises recent training: total volume, sets per muscle group, how long since each group was trained, weekly consistency against target, and estimated one-rep maxes. This is the tool to call before proposing a workout — it tells you what is undertrained and what loads the person is actually handling.",
    schema: insightsInput,
    annotations: { readOnlyHint: true, idempotentHint: true },
    activityLabel: (args) => `Analysed your last ${args.weeks} weeks`,
    execute: async (args) => {
      const insights = await apiFetch<InsightsView>(
        `/api/insights${buildQuery(args)}`,
        { actor: "agent" },
      );
      return toolOk(describeInsights(insights), insights);
    },
  });

  useWebMcpTool({
    name: "search_exercises",
    title: "Search the exercise catalog",
    description:
      "Finds exercises by name, muscle group or equipment, returning the ids needed to build a plan. Always resolve exercises through this tool before calling propose_workout_plan — passing an id is unambiguous, whereas a name that matches two entries is rejected.",
    schema: searchExercisesInput,
    annotations: { readOnlyHint: true, idempotentHint: true },
    activityLabel: (args) =>
      `Searched exercises${args.query ? ` for "${args.query}"` : ""}`,
    execute: async (args) => {
      const result = await apiFetch<{ exercises: ExerciseView[] }>(
        `/api/exercises${buildQuery(args)}`,
        { actor: "agent" },
      );

      if (result.exercises.length === 0) {
        return toolOk(
          "No exercises matched. Try a broader query, or search by muscleGroup instead of name.",
          result,
        );
      }

      return toolOk(
        result.exercises
          .map(
            (item) =>
              `${item.name} — ${item.primaryMuscle}, ${item.equipment} (id=${item.id})`,
          )
          .join("\n"),
        result,
      );
    },
  });

  useWebMcpTool({
    name: "get_active_workout",
    title: "Get the workout in progress",
    description:
      "Returns the session currently in progress, including which sets are done and which are still pending, or null if there is none. Call this before logging anything: it gives you the workoutExerciseId values that log_set requires, and it is the cheapest way to re-sync after the person has been logging sets by hand. A session that comes back with no exercises is one waiting to be programmed rather than a session that blocks you — fill it with propose_workout_plan if you are on its page, or replace it with start_workout from anywhere else.",
    schema: z.object({}),
    annotations: { readOnlyHint: true, untrustedContentHint: true },
    activityLabel: () => "Checked the active workout",
    execute: async () => {
      const result = await apiFetch<{
        workouts: WorkoutSummaryView[];
        active: WorkoutDetailView | null;
      }>(`/api/workouts${buildQuery({ limit: 1, status: "any" })}`, {
        actor: "agent",
      });

      if (!result.active) {
        return toolOk(
          "No workout is in progress. Call start_workout to begin one.",
          { active: null },
        );
      }

      return toolOk(describeWorkoutDetail(result.active), result.active);
    },
  });

  useWebMcpTool({
    name: "start_workout",
    title: "Start a workout",
    description:
      'This is the whole of "start my workout": one call closes out whatever session is still running, begins the new one, applies the plan you pass in `exercises`, and opens it — the person approves all of it in a single dialog. Program it yourself first: get_training_insights names the undertrained muscle groups, and search_exercises turns those into ids. "Start a workout" with no further detail is a complete instruction, not an ambiguous one — do not ask the person what to train or which focus they want, because choosing that is the job they handed you and the approval dialog is where they get their say. An active session that is empty is not a reason to stop either: replace it with this call, or fill it with propose_workout_plan if you are already on its page. Pass ifActive:"error" only when you would rather ask before ending a session they have running.',
    schema: startWorkoutInput,
    annotations: { readOnlyHint: false, openWorldHint: false },
    activityLabel: (args) =>
      `Started "${args.title ?? "a workout"}" with ${args.exercises.length} exercise(s)`,
    execute: async (args, client) => {
      // Starting a session is cheap and reversible (cancel_workout discards
      // it), but it changes what the person is looking at, so it is still
      // confirmed rather than done behind their back.
      const planned = args.exercises;

      // What is already running decides what this call will close, and nobody
      // can consent to that without being told which session it is. Read it
      // here rather than from the page: start_workout is registered
      // account-wide, so this often runs on a page that knows nothing about the
      // session in progress.
      const { active } = await apiFetch<{
        workouts: WorkoutSummaryView[];
        active: WorkoutDetailView | null;
      }>(`/api/workouts${buildQuery({ limit: 1, status: "any" })}`, {
        actor: "agent",
      });

      const mode = args.ifActive ?? "finish";

      // Answer before prompting. The agent asked to be stopped in this case, so
      // putting a dialog in front of the person only to fail the call behind it
      // would spend their attention on a decision that was already made.
      if (active && mode === "error") {
        return toolError(
          `"${active.title}" is already in progress (id ${active.id}), with ${active.completedSets} set(s) logged. Ask the person whether they are done with it, then call start_workout again with ifActive:"finish" to close it out and begin the new session in one step — or ifActive:"discard" to drop it without recording it.`,
          "workout_already_active",
        );
      }

      const closing = mode === "error" ? null : active;
      // Mirrors the server's rule: an empty session is dropped rather than
      // filed, so it never lands in their history. Stated here only to describe
      // it accurately — the server is what decides.
      const discarding =
        closing !== null && (mode === "discard" || closing.completedSets === 0);

      const details = [
        ...(closing
          ? [
              discarding
                ? `First: discard "${closing.title}" — ${closing.completedSets} logged set(s) will not count toward your history.`
                : `First: finish "${closing.title}" and file it into your history (${closing.completedSets} logged set(s)).`,
            ]
          : []),
        // The whole plan is listed, exercise by exercise: approving a session
        // you cannot see is not consent.
        ...describePlanForReview(planned),
      ];

      const approved = await requestConfirmation(
        {
          toolName: "start_workout",
          title: closing
            ? `Close "${closing.title}" and start ${args.title ? `"${args.title}"` : "this workout"}?`
            : args.title
              ? `Start "${args.title}"?`
              : "Start this workout?",
          description: [
            closing
              ? "Only one session can run at a time, so the one in progress is closed out first."
              : null,
            "Your agent put together the session below. Nothing is saved until you accept it.",
          ]
            .filter(Boolean)
            .join(" "),
          details,
          confirmLabel: closing ? "Close it and start" : "Start with this plan",
          // Finishing loses nothing, and discarding an empty session loses
          // nothing either. Discarding sets the person actually did is the one
          // case that warrants the red button.
          tone:
            closing !== null && discarding && closing.completedSets > 0
              ? ("danger" as const)
              : ("neutral" as const),
        },
        client,
      );

      if (!approved) {
        return toolError(
          "The person declined to start a workout. Ask what they would prefer before retrying.",
          "user_declined",
        );
      }

      const workout = await apiFetch<WorkoutDetailView>("/api/workouts", {
        method: "POST",
        body: args,
        actor: "agent",
      });

      await navigate(linkPath(`/workout/${workout.id}`));
      await revalidator.revalidate();

      const closed = closing
        ? `Closed "${closing.title}" first (${discarding ? "discarded" : "finished and filed into history"}). `
        : "";

      return toolOk(
        `${closed}Started "${workout.title}" (id ${workout.id}) and opened it with the plan applied. The workout page is open, so log_set is now available — read the ids below and log each set as they call it out.\n${describeWorkoutDetail(workout)}`,
        workout,
      );
    },
  });
}
