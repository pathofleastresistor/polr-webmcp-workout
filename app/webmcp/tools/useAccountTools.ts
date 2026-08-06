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

import { useWebMcp } from "../provider";
import { toolError, toolOk, untrusted } from "../runtime";
import { useWebMcpTool } from "../use-tool";
import {
  describeInsights,
  describeWorkoutDetail,
  describeWorkoutSummary,
} from "./format";

/**
 * Tools available everywhere once the person is signed in.
 *
 * These are the agent's read surface plus the one action that starts a session.
 * Everything that edits a workout lives in `useWorkoutTools`, registered only
 * on the workout page — an agent should not be able to log a set against a
 * session the person is not looking at.
 */
export function useAccountTools() {
  const navigate = useNavigate();
  const revalidator = useRevalidator();
  const { requestConfirmation } = useWebMcp();

  useWebMcpTool({
    name: "whoami",
    title: "Who is signed in",
    description:
      "Returns the signed-in person's display name, unit preference, experience level, training goal and weekly session target. Call this first in a session: the unit preference tells you whether to speak in kg or lb, and the goal shapes what you should program.",
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
          `${me.name} (${me.email}).`,
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
      "Returns the session currently in progress, including which sets are done and which are still pending, or null if there is none. Call this before logging anything: it gives you the workoutExerciseId values that log_set requires, and it is the cheapest way to re-sync after the person has been logging sets by hand.",
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
      "Begins a new session and opens it in the browser. The session starts empty — follow up with propose_workout_plan to fill it in. Only one workout can be in progress at a time; if one already is, this returns an error naming it.",
    schema: startWorkoutInput,
    annotations: { readOnlyHint: false, openWorldHint: false },
    activityLabel: (args) => `Started "${args.title ?? "a workout"}"`,
    execute: async (args, client) => {
      // Starting a session is cheap and reversible (cancel_workout discards
      // it), but it changes what the person is looking at, so it is still
      // confirmed rather than done behind their back.
      const approved = await requestConfirmation(
        {
          toolName: "start_workout",
          title: "Start a new workout?",
          description:
            "Your agent wants to begin a new session and open it in this tab.",
          details: args.title ? [`Title: ${args.title}`] : undefined,
          confirmLabel: "Start workout",
          tone: "neutral",
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

      await navigate(`/workout/${workout.id}`);
      await revalidator.revalidate();

      return toolOk(
        `Started "${workout.title}" (id ${workout.id}) and opened it. It has no exercises yet — call propose_workout_plan with this workoutId to populate it.`,
        workout,
      );
    },
  });
}
