import { Link } from "react-router";

import { AppShell } from "~/components/AppShell";
import { CompletedWorkout } from "~/components/CompletedWorkout";
import { WorkoutPlanEmptyState } from "~/components/WorkoutPlanEmptyState";
import { WorkoutRunner } from "~/components/WorkoutRunner";
import { getAppContext } from "~/server/context";
import { getWorkoutDetail } from "~/server/services/workouts.server";
import { requireUser } from "~/server/session.server";
import { useAccountTools } from "~/webmcp/tools/useAccountTools";
import { useWorkoutTools } from "~/webmcp/tools/useWorkoutTools";

import type { Route } from "./+types/workout";

export function meta({ loaderData }: Route.MetaArgs): Route.MetaDescriptors {
  return [{ title: `${loaderData?.workout.title ?? "Workout"} — Spotter` }];
}

export async function loader({ request, context, params }: Route.LoaderArgs) {
  const user = await requireUser(request, context);
  const { db } = getAppContext(context);

  // Scoped to the signed-in user inside the service; a workout belonging to
  // someone else surfaces as a 404.
  const workout = await getWorkoutDetail(db, user.id, params.workoutId);

  return {
    workout,
    profile: {
      id: user.id,
      name: user.name,
      email: user.email,
      image: user.image,
      unitSystem: user.profile.unitSystem,
      experienceLevel: user.profile.experienceLevel,
      goal: user.profile.goal,
      timezone: user.profile.timezone,
      weeklyTargetSessions: user.profile.weeklyTargetSessions,
    },
  };
}

export default function WorkoutRoute({ loaderData }: Route.ComponentProps) {
  const { workout, profile } = loaderData;

  // Account-wide tools stay available so the agent can still consult history
  // mid-session; the workout tools are scoped to this page and this workout.
  useAccountTools();
  useWorkoutTools(workout);

  const isActive = workout.status === "active";
  const isEmpty = workout.exercises.length === 0;

  return (
    <AppShell user={profile}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link
            to="/dashboard"
            className="text-sm text-slate-400 transition hover:text-slate-200"
          >
            ← Dashboard
          </Link>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">
            {workout.title}
          </h1>
          <p className="mt-1 text-sm text-slate-400">
            {workout.status === "active"
              ? `In progress · started ${new Date(workout.startedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`
              : `${workout.status} · ${new Date(workout.startedAt).toLocaleDateString()}`}
            {workout.plannedBy === "agent" && " · planned by your agent"}
          </p>
        </div>
      </div>

      {!isActive ? (
        <CompletedWorkout workout={workout} unitSystem={profile.unitSystem} />
      ) : isEmpty ? (
        <WorkoutPlanEmptyState workout={workout} />
      ) : (
        <WorkoutRunner workout={workout} unitSystem={profile.unitSystem} />
      )}
    </AppShell>
  );
}
