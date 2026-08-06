import { z } from "zod";

import {
  addExerciseInput,
  addNoteInput,
  cancelWorkoutInput,
  finishWorkoutInput,
  proposePlanInput,
  removeExerciseInput,
} from "~/domain/contracts";
import type { WorkoutDetailView } from "~/domain/types";
import { handleApiRequest } from "~/server/api-handler.server";
import { recordEvent } from "~/server/services/audit.server";
import { invalid } from "~/server/services/errors";
import {
  addExerciseToWorkout,
  appendNote,
  cancelWorkout,
  finishWorkout,
  getWorkoutDetail,
  removeExerciseFromWorkout,
  replacePlan,
} from "~/server/services/workouts.server";

import type { Route } from "./+types/api.workouts.$workoutId";

export async function loader({ request, context, params }: Route.LoaderArgs) {
  return handleApiRequest(request, context, {
    schema: z.object({}),
    handle: ({ user, db }) => getWorkoutDetail(db, user.id, params.workoutId),
  });
}

/**
 * Commands against one workout, discriminated on `op`.
 *
 * A single endpoint (rather than one per verb) keeps the pipeline in
 * `handleApiRequest` — auth, rate limit, validation, audit — applied uniformly,
 * and Zod's discriminated union still gives each command its own strict schema.
 */
const commandSchema = z.discriminatedUnion("op", [
  proposePlanInput.extend({ op: z.literal("propose_plan") }),
  addExerciseInput.extend({ op: z.literal("add_exercise") }),
  removeExerciseInput.extend({ op: z.literal("remove_exercise") }),
  addNoteInput.extend({ op: z.literal("add_note") }),
  finishWorkoutInput.extend({ op: z.literal("finish") }),
  cancelWorkoutInput.extend({ op: z.literal("cancel") }),
]);

export async function action({ request, context, params }: Route.ActionArgs) {
  if (request.method !== "POST") {
    return Response.json(
      { error: "method_not_allowed", message: "Use POST with an `op` field." },
      { status: 405, headers: { Allow: "POST" } },
    );
  }

  return handleApiRequest(request, context, {
    schema: commandSchema,
    handle: async ({ input, user, db, actor }) => {
      // The path is authoritative: a body that disagrees is a client bug, and
      // silently trusting the body would let one call target another workout.
      if (input.workoutId !== params.workoutId) {
        throw invalid(
          "workout_id_mismatch",
          `workoutId in the body ("${input.workoutId}") must match the URL ("${params.workoutId}").`,
        );
      }

      const { result, summary } = await run(db, user.id, input, actor);

      await recordEvent(db, {
        userId: user.id,
        workoutId: result.id,
        toolName: input.op,
        actor,
        args: input,
        summary,
      });

      return result;
    },
  });
}

type Command = z.infer<typeof commandSchema>;

async function run(
  db: Parameters<typeof replacePlan>[0],
  userId: string,
  input: Command,
  actor: "human" | "agent",
): Promise<{ result: WorkoutDetailView; summary: string }> {
  switch (input.op) {
    case "propose_plan": {
      const result = await replacePlan(db, userId, input, actor);
      return {
        result,
        summary: `Planned ${result.exercises.length} exercise(s): ${result.exercises
          .map((entry) => entry.exercise.name)
          .join(", ")}`,
      };
    }
    case "add_exercise": {
      const result = await addExerciseToWorkout(db, userId, input);
      return {
        result,
        summary: `Added ${input.exerciseName ?? input.exerciseId ?? "an exercise"} to the workout`,
      };
    }
    case "remove_exercise": {
      const result = await removeExerciseFromWorkout(db, userId, input);
      return { result, summary: "Removed an exercise from the workout" };
    }
    case "add_note": {
      const result = await appendNote(db, userId, input.workoutId, input.note);
      return { result, summary: "Added a note" };
    }
    case "finish": {
      const result = await finishWorkout(db, userId, input);
      return {
        result,
        summary: `Finished "${result.title}" — ${result.completedSets} set(s), ${result.totalVolumeKg} kg total volume`,
      };
    }
    case "cancel": {
      const result = await cancelWorkout(db, userId, input);
      return { result, summary: `Discarded "${result.title}"` };
    }
  }
}
