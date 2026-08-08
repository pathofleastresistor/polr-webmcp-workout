import { listWorkoutsInput, startWorkoutInput } from "~/domain/contracts";
import { handleApiRequest } from "~/server/api-handler.server";
import { recordEvent } from "~/server/services/audit.server";
import {
  getActiveWorkout,
  getWorkoutDetail,
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
      // Read before starting, because starting may close it. A session that
      // ended as a side effect of this call is exactly the thing the person
      // needs the activity log to tell them about.
      const previous = await getActiveWorkout(db, user.id);

      const created = await startWorkout(db, user.id, input, actor);

      if (previous && previous.id !== created.id) {
        // Re-read rather than re-deriving whether it was finished or discarded:
        // that rule lives in the service, and a second copy of it here would be
        // free to drift into logging something that did not happen.
        const closed = await getWorkoutDetail(db, user.id, previous.id);
        const finished = closed.status === "completed";

        await recordEvent(db, {
          userId: user.id,
          workoutId: closed.id,
          toolName: finished ? "finish_workout" : "cancel_workout",
          actor,
          summary: `${finished ? "Finished" : "Discarded"} "${closed.title}" to start a new session`,
        });
      }

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
