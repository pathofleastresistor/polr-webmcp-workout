import { createExerciseInput, searchExercisesInput } from "~/domain/contracts";
import { handleApiRequest } from "~/server/api-handler.server";
import { recordEvent } from "~/server/services/audit.server";
import {
  createExercise,
  searchExercises,
} from "~/server/services/exercises.server";

import type { Route } from "./+types/api.exercises";

export async function loader({ request, context }: Route.LoaderArgs) {
  return handleApiRequest(request, context, {
    schema: searchExercisesInput,
    handle: async ({ input, user, db }) => ({
      exercises: await searchExercises(db, user.id, input),
    }),
  });
}

export async function action({ request, context }: Route.ActionArgs) {
  if (request.method !== "POST") {
    return Response.json(
      {
        error: "method_not_allowed",
        message: "Use POST to create an exercise.",
      },
      { status: 405, headers: { Allow: "POST" } },
    );
  }

  return handleApiRequest(request, context, {
    schema: createExerciseInput,
    handle: async ({ input, user, db, actor }) => {
      const result = await createExercise(db, user.id, input);

      // Only an actual creation is worth an audit entry; a match is a read in
      // everything but name, and logging those would bury the real ones.
      if (result.created) {
        await recordEvent(db, {
          userId: user.id,
          toolName: "create_exercise",
          actor,
          args: input,
          summary: `Added "${result.exercise.name}" to the exercise library`,
        });
      }

      return result;
    },
  });
}
