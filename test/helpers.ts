import { migrate } from "drizzle-orm/better-sqlite3/migrator";

import { createDatabase, type Database } from "~/db";
import { exercise, user, userProfile } from "~/db/schema";
import type { UserProfile } from "~/db/schema";

/**
 * A private, migrated database per call.
 *
 * `:memory:` is scoped to the connection, so every caller gets its own — tests
 * cannot leak state into each other and none of them can reach a real file.
 * The real migrations are applied rather than a hand-written schema, so tests
 * exercise the same indexes, constraints and cascades that production has.
 */
export function testDb(): Database {
  const db = createDatabase(":memory:");
  migrate(db, { migrationsFolder: "./drizzle/migrations" });
  return db;
}

let counter = 0;

/** Creates a user with a profile, mirroring what the session layer does. */
export async function createUser(
  db: Database,
  overrides: Partial<UserProfile> = {},
): Promise<{ id: string; profile: UserProfile }> {
  const id = `user-${++counter}-${crypto.randomUUID().slice(0, 8)}`;

  await db.insert(user).values({
    id,
    name: `Test User ${counter}`,
    email: `test-${id}@example.com`,
    emailVerified: true,
  });

  const [profile] = await db
    .insert(userProfile)
    .values({ userId: id, ...overrides })
    .returning();

  return { id, profile: profile! };
}

/** Inserts the handful of catalog rows the tests reference by id. */
export async function seedExercises(db: Database): Promise<void> {
  await db
    .insert(exercise)
    .values([
      {
        id: "bench-press",
        slug: "bench-press",
        name: "Bench Press",
        primaryMuscle: "chest",
        secondaryMuscles: ["triceps"],
        equipment: "barbell",
      },
      {
        id: "back-squat",
        slug: "back-squat",
        name: "Back Squat",
        primaryMuscle: "quads",
        secondaryMuscles: ["glutes"],
        equipment: "barbell",
      },
      {
        id: "pull-up",
        slug: "pull-up",
        name: "Pull-Up",
        primaryMuscle: "back",
        secondaryMuscles: ["biceps"],
        equipment: "bodyweight",
      },
      // Two rows whose names differ only by case, to prove that name
      // resolution rejects ambiguity instead of guessing.
      {
        id: "row-a",
        slug: "row-a",
        name: "Row",
        primaryMuscle: "back",
        secondaryMuscles: [],
        equipment: "barbell",
      },
      {
        id: "row-b",
        slug: "row-b",
        name: "row",
        primaryMuscle: "back",
        secondaryMuscles: [],
        equipment: "cable",
      },
    ])
    .onConflictDoNothing();
}
