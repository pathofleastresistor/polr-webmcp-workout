import { z } from "zod";

import {
  EXPERIENCE_LEVELS,
  MODALITIES,
  MUSCLE_GROUPS,
  UNIT_SYSTEMS,
} from "~/db/schema";

/**
 * Every operation the product supports is defined once, here, as a Zod schema.
 *
 * The same schema is used three ways:
 *   1. converted to JSON Schema for the WebMCP tool's `inputSchema`,
 *   2. parsed on the client before a tool issues its request,
 *   3. parsed again on the server, which is the only check that is trusted.
 *
 * That keeps the agent-facing contract and the server's contract from drifting.
 */

export const idSchema = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[A-Za-z0-9_-]+$/, "Must be a URL-safe identifier");

/** Free text authored by a human or an agent. Length-bounded and trimmed. */
const freeText = (max: number) => z.string().trim().max(max);

export const unitSystemSchema = z.enum(UNIT_SYSTEMS);
export const experienceLevelSchema = z.enum(EXPERIENCE_LEVELS);
export const muscleGroupSchema = z.enum(MUSCLE_GROUPS);
export const modalitySchema = z.enum(MODALITIES);

/* -------------------------------------------------------------------------- */
/* Reads                                                                      */
/* -------------------------------------------------------------------------- */

export const listWorkoutsInput = z.object({
  limit: z
    .number()
    .int()
    .min(1)
    .max(50)
    .default(10)
    .describe("How many workouts to return, newest first (1-50)."),
  status: z
    .enum(["active", "completed", "abandoned", "any"])
    .default("completed")
    .describe(
      "Filter by workout status. Use 'any' to include in-progress and abandoned sessions.",
    ),
  since: z.iso
    .date()
    .optional()
    .describe("Only include workouts on or after this date (YYYY-MM-DD)."),
});
export type ListWorkoutsInput = z.infer<typeof listWorkoutsInput>;

export const getWorkoutInput = z.object({
  workoutId: idSchema.describe("Id of the workout to fetch."),
});

export const searchExercisesInput = z.object({
  query: freeText(80)
    .optional()
    .describe("Free-text match against the exercise name, e.g. 'row'."),
  muscleGroup: muscleGroupSchema
    .optional()
    .describe("Restrict to exercises whose primary muscle is this group."),
  equipment: freeText(40)
    .optional()
    .describe(
      "Restrict by equipment, e.g. 'barbell', 'dumbbell', 'bodyweight'.",
    ),
  limit: z.number().int().min(1).max(50).default(20),
});

export const insightsInput = z.object({
  weeks: z
    .number()
    .int()
    .min(1)
    .max(26)
    .default(8)
    .describe("How many recent weeks of training to summarise."),
});

/* -------------------------------------------------------------------------- */
/* Workout lifecycle                                                          */
/* -------------------------------------------------------------------------- */

export const plannedSetSchema = z.object({
  reps: z
    .number()
    .int()
    .min(1)
    .max(1000)
    .optional()
    .describe("Target repetitions for this set."),
  weightKg: z
    .number()
    .min(0)
    .max(1000)
    .optional()
    .describe(
      "Target load in kilograms. Always kilograms, regardless of the user's display units.",
    ),
  rpe: z
    .number()
    .min(1)
    .max(10)
    .optional()
    .describe("Target rate of perceived exertion, 1-10."),
  durationSeconds: z.number().int().min(1).max(86_400).optional(),
  distanceMeters: z.number().min(0).max(1_000_000).optional(),
  isWarmup: z.boolean().default(false),
});
export type PlannedSet = z.infer<typeof plannedSetSchema>;

export const plannedExerciseSchema = z.object({
  exerciseId: idSchema
    .optional()
    .describe(
      "Id from search_exercises. Preferred over exerciseName because it is unambiguous.",
    ),
  exerciseName: freeText(80)
    .optional()
    .describe(
      "Exercise name, matched against the catalog when exerciseId is not given. Rejected if it does not resolve to exactly one exercise.",
    ),
  sets: z
    .array(plannedSetSchema)
    .min(1)
    .max(20)
    .describe("The sets to perform, in order."),
  rationale: freeText(280)
    .optional()
    .describe(
      "Why this exercise was chosen. Shown to the person so they can judge the suggestion.",
    ),
});
export type PlannedExercise = z.infer<typeof plannedExerciseSchema>;

export const proposePlanInput = z.object({
  workoutId: idSchema.describe("Id of the active workout to populate."),
  title: freeText(80)
    .optional()
    .describe("Short name for the session, e.g. 'Upper body push'."),
  notes: freeText(1000)
    .optional()
    .describe("Optional coaching notes shown alongside the plan."),
  exercises: z
    .array(plannedExerciseSchema)
    .min(1)
    .max(20)
    .describe("The planned exercises, in the order they should be performed."),
});
export type ProposePlanInput = z.infer<typeof proposePlanInput>;

export const startWorkoutInput = z.object({
  title: freeText(80)
    .optional()
    .describe(
      "Optional name for the session. Defaults to a time-of-day label.",
    ),
  notes: freeText(1000).optional(),
  /**
   * Lets a session be started and planned in one call.
   *
   * Without this, an agent on the dashboard has to call start_workout and then
   * propose_workout_plan — but the planning tools only register once the
   * workout page is open, so the tool it is told to call next does not exist
   * at the moment it is told to call it.
   */
  exercises: z
    .array(plannedExerciseSchema)
    .min(1)
    .max(20)
    .optional()
    .describe(
      "Optional plan to apply immediately, same shape as propose_workout_plan. Pass this when the person asked for a workout rather than an empty session — it starts and populates in one step, which is the only way to do both from the dashboard.",
    ),
});

export const addExerciseInput = z.object({
  workoutId: idSchema,
  exerciseId: idSchema.optional(),
  exerciseName: freeText(80).optional(),
  sets: z.array(plannedSetSchema).min(1).max(20),
  rationale: freeText(280).optional(),
  position: z
    .number()
    .int()
    .min(0)
    .max(50)
    .optional()
    .describe("Insert at this index. Appends to the end when omitted."),
});

export const removeExerciseInput = z.object({
  workoutId: idSchema,
  workoutExerciseId: idSchema.describe(
    "Id of the entry within the workout, from get_active_workout.",
  ),
});

export const logSetInput = z.object({
  workoutId: idSchema,
  workoutExerciseId: idSchema.describe(
    "Which exercise within the workout, from get_active_workout.",
  ),
  setIndex: z
    .number()
    .int()
    .min(1)
    .max(50)
    .describe("1-based position of the set within the exercise."),
  // These are what the person *actually did*, and recording that faithfully is
  // the entire point of the tool. They were previously undescribed, which left
  // an agent with no way to tell them apart from the planned targets and no
  // statement of units — so a set performed at a different load or rep count
  // was commonly logged as the plan, and pounds were logged as kilograms.
  reps: z
    .number()
    .int()
    .min(0)
    .max(1000)
    .optional()
    .describe(
      "Repetitions actually completed. Pass this whenever it differs from the planned target; omit only when the set went exactly to plan.",
    ),
  weightKg: z
    .number()
    .min(0)
    .max(1000)
    .optional()
    .describe(
      "Load actually used, in kilograms. Always kilograms, regardless of the person's display units — convert before calling if they speak in pounds. Pass this whenever it differs from the planned target; omit only when the set went exactly to plan.",
    ),
  rpe: z
    .number()
    .min(1)
    .max(10)
    .optional()
    .describe(
      "Rate of perceived exertion the person actually reported, 1-10. Overrides the planned target.",
    ),
  durationSeconds: z
    .number()
    .int()
    .min(0)
    .max(86_400)
    .optional()
    .describe(
      "Time actually spent on the set, in seconds. Overrides the planned target.",
    ),
  distanceMeters: z
    .number()
    .min(0)
    .max(1_000_000)
    .optional()
    .describe(
      "Distance actually covered, in metres. Overrides the planned target.",
    ),
  status: z
    .enum(["completed", "skipped"])
    .default("completed")
    .describe("Whether the set was performed or deliberately skipped."),
});
export type LogSetInput = z.infer<typeof logSetInput>;

export const addNoteInput = z.object({
  workoutId: idSchema,
  note: freeText(1000).min(1).describe("Note to append to the session."),
});

export const finishWorkoutInput = z.object({
  workoutId: idSchema,
  notes: freeText(1000).optional().describe("Optional closing note."),
});

export const cancelWorkoutInput = z.object({
  workoutId: idSchema,
  reason: freeText(280).optional(),
});

export const updateProfileInput = z.object({
  unitSystem: unitSystemSchema.optional(),
  experienceLevel: experienceLevelSchema.optional(),
  goal: freeText(280).optional(),
  weeklyTargetSessions: z.number().int().min(1).max(14).optional(),
  timezone: freeText(64).optional(),
});

/* -------------------------------------------------------------------------- */
/* JSON Schema derivation for WebMCP                                          */
/* -------------------------------------------------------------------------- */

/**
 * WebMCP tool `inputSchema` values must be plain JSON Schema objects. Agents
 * read these to construct calls, so descriptions written on the Zod schema are
 * the agent-facing documentation.
 */
export function toolInputSchema(schema: z.ZodType): Record<string, unknown> {
  const json = z.toJSONSchema(schema, {
    target: "draft-2020-12",
    io: "input",
    // Agents call tools with concrete values; keep the schema self-contained
    // rather than emitting $refs they would have to resolve.
    reused: "inline",
  }) as Record<string, unknown>;

  delete json.$schema;
  return json;
}
