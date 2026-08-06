import { listWorkoutsInput, startWorkoutInput } from "~/domain/contracts";
import { handleApiRequest } from "~/server/api-handler.server";
import { recordEvent } from "~/server/services/audit.server";
import {
  getActiveWorkout,
  listWorkouts,
  startWorkout,
} from "~/server/services/workouts.server";

import type { Route } from "./+types/api.workouts";

export async function loader({ request, context }: Route.LoaderArgs) {
  return handleApiRequest(request, context, {
    schema: listWorkoutsInput,
    handle: async ({ input, user, db }) => ({
      workouts: await listWorkouts(db, user.id, input),
      active: await getActiveWorkout(db, user.id),
    }),
  });
}

export async function action({ request, context }: Route.ActionArgs) {
  if (request.method !== "POST") {
    return Response.json(
      { error: "method_not_allowed", message: "Use POST to start a workout." },
      { status: 405, headers: { Allow: "POST" } },
    );
  }

  return handleApiRequest(request, context, {
    schema: startWorkoutInput,
    handle: async ({ input, user, db, actor }) => {
      const created = await startWorkout(db, user.id, input, actor);

      await recordEvent(db, {
        userId: user.id,
        workoutId: created.id,
        toolName: "start_workout",
        actor,
        args: input,
        summary: `Started "${created.title}"`,
      });

      return created;
    },
  });
}
