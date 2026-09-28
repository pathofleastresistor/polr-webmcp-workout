import { Link } from "react-router";

import { AppShell } from "~/components/AppShell";
import { CompletedWorkout } from "~/components/CompletedWorkout";
import { WorkoutPlanEmptyState } from "~/components/WorkoutPlanEmptyState";
import { WorkoutRunner } from "~/components/WorkoutRunner";
import { useLinkPath } from "~/lib/link";
import { requireUser } from "~/server/access.server";
import { getAppContext } from "~/server/context";
import { getWorkoutDetail } from "~/server/services/workouts.server";
import { useAccountTools } from "~/webmcp/tools/useAccountTools";
import { useWorkoutTools } from "~/webmcp/tools/useWorkoutTools";

import type { Route } from "./+types/workout";

export function meta({ loaderData }: Route.MetaArgs): Route.MetaDescriptors {
  return [{ title: `${loaderData?.workout.title ?? "Workout"} · Spotter` }];
}

export async function loader({ request, context, params }: Route.LoaderArgs) {
  const user = await requireUser(request, context);
  const { db } = getAppContext(context);

  // Scoped to the link's owner inside the service; a workout belonging to
  // someone else surfaces as a 404.
  const workout = await getWorkoutDetail(db, user.id, params.workoutId);

  return { workout, unitSystem: user.profile.unitSystem };
}

export default function WorkoutRoute({ loaderData }: Route.ComponentProps) {
  const { workout, unitSystem } = loaderData;
  const linkPath = useLinkPath();

  // Account-wide tools stay available so the agent can still consult history
  // mid-session; the workout tools are scoped to this page and this workout.
  useAccountTools();
  useWorkoutTools(workout);

  const isActive = workout.status === "active";
  const isEmpty = workout.exercises.length === 0;

  return (
    <AppShell>
      <Link to={linkPath()} className="btn btn-sm btn-ghost -ml-4">
        Back
      </Link>
      <h1 className="display mt-2">{workout.title}</h1>
      <p className="caption mt-2">
        {isActive
          ? `In progress · started ${new Date(workout.startedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`
          : new Date(workout.startedAt).toLocaleDateString()}
        {workout.plannedBy === "agent" && " · planned by your agent"}
      </p>

      {!isActive ? (
        <CompletedWorkout workout={workout} unitSystem={unitSystem} />
      ) : isEmpty ? (
        <WorkoutPlanEmptyState workout={workout} />
      ) : (
        <WorkoutRunner workout={workout} unitSystem={unitSystem} />
      )}
    </AppShell>
  );
}
