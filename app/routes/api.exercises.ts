import { searchExercisesInput } from "~/domain/contracts";
import { handleApiRequest } from "~/server/api-handler.server";
import { searchExercises } from "~/server/services/exercises.server";

import type { Route } from "./+types/api.exercises";

export async function loader({ request, context }: Route.LoaderArgs) {
  return handleApiRequest(request, context, {
    schema: searchExercisesInput,
    handle: async ({ input, user, db }) => ({
      exercises: await searchExercises(db, user.id, input),
    }),
  });
}
