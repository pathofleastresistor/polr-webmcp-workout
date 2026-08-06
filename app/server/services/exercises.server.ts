import { and, asc, eq, isNull, or, sql } from "drizzle-orm";

import type { Database } from "~/db";
import { exercise } from "~/db/schema";
import type { ExerciseView } from "~/domain/types";

import { invalid } from "./errors";
import { newId } from "./ids";
import type {
  CreateExerciseInput,
  SearchExercisesInput,
} from "./service-inputs";
import { toExerciseView } from "./workouts.server";

/**
 * Searches the exercises visible to this person.
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

/**
 * Returns the person's exercise matching this name, creating it if there is
 * none.
 *
 * Match-or-create rather than plain create, and that is the whole point of the
 * function. Volume, staleness and estimated 1RMs are all keyed on the exercise
 * row, so "Bench Press" and "bench press" landing as two rows would silently
 * split one lift's history in two and skew every insight drawn from it — the
 * kind of failure that produces wrong numbers rather than an error. Matching on
 * a normalised slug makes a repeat call return the original row instead.
 *
 * An existing match is returned unchanged. The caller's muscle attribution is
 * *not* applied over it, so a later call that describes the movement
 * differently cannot silently rewrite the basis of history already recorded
 * against it.
 */
export async function createExercise(
  db: Database,
  userId: string,
  input: CreateExerciseInput,
): Promise<{ exercise: ExerciseView; created: boolean }> {
  const name = input.name.trim();
  const slug = slugify(name);

  if (!slug) {
    throw invalid(
      "invalid_exercise_name",
      `"${name}" has no letters or digits to name an exercise by.`,
    );
  }

  const existing = await db.query.exercise.findFirst({
    where: and(
      eq(exercise.slug, slug),
      or(isNull(exercise.createdBy), eq(exercise.createdBy, userId))!,
    ),
  });

  if (existing) {
    return { exercise: toExerciseView(existing), created: false };
  }

  // Drop any secondary that repeats the primary, so the same group cannot be
  // counted twice when insights attribute volume.
  const secondaryMuscles = [...new Set(input.secondaryMuscles)].filter(
    (group) => group !== input.primaryMuscle,
  );

  const row = {
    id: newId(),
    slug,
    name,
    primaryMuscle: input.primaryMuscle,
    secondaryMuscles,
    equipment: input.equipment.trim() || "bodyweight",
    modality: input.modality,
    isUnilateral: input.isUnilateral,
    createdBy: userId,
    createdAt: new Date(),
  };

  await db.insert(exercise).values(row);

  return { exercise: toExerciseView(row), created: true };
}

/**
 * Normalises a name to the identity two spellings of one movement should share:
 * case, punctuation and spacing folded away, so "Bulgarian Split Squat",
 * "bulgarian split-squat" and "Bulgarian  Split  Squat" are one exercise.
 */
export function slugify(name: string): string {
  return (
    name
      .normalize("NFKD")
      // Strip accents so "Curl" and "Cúrl" do not become separate exercises.
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
  );
}
