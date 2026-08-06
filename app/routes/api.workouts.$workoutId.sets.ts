import { logSetInput } from "~/domain/contracts";
import { handleApiRequest } from "~/server/api-handler.server";
import { recordEvent } from "~/server/services/audit.server";
import { invalid } from "~/server/services/errors";
import { logSet } from "~/server/services/workouts.server";

import type { Route } from "./+types/api.workouts.$workoutId.sets";

export async function action({ request, context, params }: Route.ActionArgs) {
  if (request.method !== "POST") {
    return Response.json(
      { error: "method_not_allowed", message: "Use POST to log a set." },
      { status: 405, headers: { Allow: "POST" } },
    );
  }

  return handleApiRequest(request, context, {
    schema: logSetInput,
    handle: async ({ input, user, db, actor }) => {
      if (input.workoutId !== params.workoutId) {
        throw invalid(
          "workout_id_mismatch",
          `workoutId in the body ("${input.workoutId}") must match the URL ("${params.workoutId}").`,
        );
      }

      const result = await logSet(db, user.id, input, actor);

      const entry = result.exercises.find(
        (candidate) => candidate.id === input.workoutExerciseId,
      );
      const detail = [
        input.weightKg !== undefined ? `${input.weightKg} kg` : null,
        input.reps !== undefined ? `${input.reps} reps` : null,
        input.rpe !== undefined ? `RPE ${input.rpe}` : null,
      ]
        .filter(Boolean)
        .join(" x ");

      await recordEvent(db, {
        userId: user.id,
        workoutId: result.id,
        toolName: "log_set",
        actor,
        args: input,
        summary:
          input.status === "skipped"
            ? `Skipped set ${input.setIndex} of ${entry?.exercise.name ?? "an exercise"}`
            : `Logged ${entry?.exercise.name ?? "set"} set ${input.setIndex}${detail ? ` — ${detail}` : ""}`,
      });

      return result;
    },
  });
}
