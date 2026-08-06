import type { z } from "zod";

import type {
  addExerciseInput,
  addNoteInput,
  cancelWorkoutInput,
  finishWorkoutInput,
  insightsInput,
  listWorkoutsInput,
  logSetInput,
  proposePlanInput,
  removeExerciseInput,
  searchExercisesInput,
  startWorkoutInput,
  updateProfileInput,
} from "~/domain/contracts";

/**
 * Services take already-parsed input. Deriving the parameter types from the Zod
 * contracts means a change to a tool's schema is a compile error in the service
 * that implements it, rather than a runtime surprise.
 */
export type ListWorkoutsInput = z.infer<typeof listWorkoutsInput>;
export type SearchExercisesInput = z.infer<typeof searchExercisesInput>;
export type InsightsInput = z.infer<typeof insightsInput>;
export type StartWorkoutInput = z.infer<typeof startWorkoutInput>;
export type ProposePlanInput = z.infer<typeof proposePlanInput>;
export type AddExerciseInput = z.infer<typeof addExerciseInput>;
export type RemoveExerciseInput = z.infer<typeof removeExerciseInput>;
export type LogSetInput = z.infer<typeof logSetInput>;
export type AddNoteInput = z.infer<typeof addNoteInput>;
export type FinishWorkoutInput = z.infer<typeof finishWorkoutInput>;
export type CancelWorkoutInput = z.infer<typeof cancelWorkoutInput>;
export type UpdateProfileInput = z.infer<typeof updateProfileInput>;

export type { PlannedExercise, PlannedSet } from "~/domain/contracts";
