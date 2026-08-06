import { and, asc, eq, isNull, or, sql } from "drizzle-orm";

import type { Database } from "~/db";
import { exercise } from "~/db/schema";
import type { ExerciseView } from "~/domain/types";

import type { SearchExercisesInput } from "./service-inputs";
import { toExerciseView } from "./workouts.server";

/**
 * Searches the shared catalog plus the caller's own custom exercises.
 *
 * Matching is a case-insensitive substring on the name. `LIKE` with a leading
 * wildcard cannot use an index, which is fine at catalog scale (hundreds of
 * rows) and keeps the query predictable; revisit with FTS5 if the catalog grows
 * into the thousands.
 */
export async function searchExercises(
  db: Database,
  userId: string,
  input: SearchExercisesInput,
): Promise<ExerciseView[]> {
  const filters = [
    or(isNull(exercise.createdBy), eq(exercise.createdBy, userId))!,
  ];

  if (input.query) {
    // Bound as a parameter, so the wildcards cannot be injected by the caller.
    const pattern = `%${escapeLike(input.query)}%`;
    filters.push(sql`${exercise.name} like ${pattern} escape '\\'`);
  }
  if (input.muscleGroup) {
    filters.push(eq(exercise.primaryMuscle, input.muscleGroup));
  }
  if (input.equipment) {
    filters.push(sql`lower(${exercise.equipment}) = lower(${input.equipment})`);
  }

  const rows = await db
    .select()
    .from(exercise)
    .where(and(...filters))
    .orderBy(asc(exercise.name))
    .limit(input.limit);

  return rows.map(toExerciseView);
}

/** Escapes LIKE metacharacters so a query of `100%` is a literal search. */
function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (match) => `\\${match}`);
}
