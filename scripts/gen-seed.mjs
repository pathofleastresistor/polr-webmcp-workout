// Generates drizzle/seed/exercises.sql from the catalog below.
// Run with: node scripts/gen-seed.mjs
//
// Ids are the slug rather than a random UUID: the shared catalog is reference
// data, so stable ids make the seed idempotent and let the same exercise id
// mean the same thing in local, preview and production databases.
import { mkdirSync, writeFileSync } from "node:fs";

const E = (
  name,
  primary,
  secondary,
  equipment,
  modality = "strength",
  unilateral = false,
) => ({ name, primary, secondary, equipment, modality, unilateral });

const catalog = [
  // Chest
  E("Barbell Bench Press", "chest", ["triceps", "shoulders"], "barbell"),
  E(
    "Incline Barbell Bench Press",
    "chest",
    ["shoulders", "triceps"],
    "barbell",
  ),
  E("Dumbbell Bench Press", "chest", ["triceps", "shoulders"], "dumbbell"),
  E("Incline Dumbbell Press", "chest", ["shoulders", "triceps"], "dumbbell"),
  E("Dumbbell Fly", "chest", [], "dumbbell"),
  E("Cable Crossover", "chest", [], "cable"),
  E("Push-Up", "chest", ["triceps", "core"], "bodyweight"),
  E("Machine Chest Press", "chest", ["triceps"], "machine"),
  E("Dip", "chest", ["triceps"], "bodyweight"),
  // Back
  E("Deadlift", "back", ["hamstrings", "glutes", "core"], "barbell"),
  E("Barbell Row", "back", ["biceps"], "barbell"),
  E("Pull-Up", "back", ["biceps"], "bodyweight"),
  E("Chin-Up", "back", ["biceps"], "bodyweight"),
  E("Lat Pulldown", "back", ["biceps"], "cable"),
  E("Seated Cable Row", "back", ["biceps"], "cable"),
  E(
    "Single-Arm Dumbbell Row",
    "back",
    ["biceps"],
    "dumbbell",
    "strength",
    true,
  ),
  E("T-Bar Row", "back", ["biceps"], "barbell"),
  E("Face Pull", "back", ["shoulders"], "cable"),
  E("Rack Pull", "back", ["glutes", "hamstrings"], "barbell"),
  // Shoulders
  E("Overhead Press", "shoulders", ["triceps", "core"], "barbell"),
  E("Seated Dumbbell Shoulder Press", "shoulders", ["triceps"], "dumbbell"),
  E("Lateral Raise", "shoulders", [], "dumbbell"),
  E("Rear Delt Fly", "shoulders", ["back"], "dumbbell"),
  E("Arnold Press", "shoulders", ["triceps"], "dumbbell"),
  E("Upright Row", "shoulders", ["back"], "barbell"),
  // Arms
  E("Barbell Curl", "biceps", [], "barbell"),
  E("Dumbbell Curl", "biceps", [], "dumbbell", "strength", true),
  E("Hammer Curl", "biceps", [], "dumbbell", "strength", true),
  E("Preacher Curl", "biceps", [], "barbell"),
  E("Cable Curl", "biceps", [], "cable"),
  E("Close-Grip Bench Press", "triceps", ["chest", "shoulders"], "barbell"),
  E("Triceps Pushdown", "triceps", [], "cable"),
  E("Overhead Triceps Extension", "triceps", [], "dumbbell"),
  E("Skullcrusher", "triceps", [], "barbell"),
  // Legs
  E("Back Squat", "quads", ["glutes", "hamstrings", "core"], "barbell"),
  E("Front Squat", "quads", ["glutes", "core"], "barbell"),
  E("Leg Press", "quads", ["glutes"], "machine"),
  E("Bulgarian Split Squat", "quads", ["glutes"], "dumbbell", "strength", true),
  E(
    "Walking Lunge",
    "quads",
    ["glutes", "hamstrings"],
    "dumbbell",
    "strength",
    true,
  ),
  E("Leg Extension", "quads", [], "machine"),
  E("Goblet Squat", "quads", ["glutes", "core"], "dumbbell"),
  E("Romanian Deadlift", "hamstrings", ["glutes", "back"], "barbell"),
  E("Lying Leg Curl", "hamstrings", [], "machine"),
  E("Seated Leg Curl", "hamstrings", [], "machine"),
  E("Good Morning", "hamstrings", ["glutes", "back"], "barbell"),
  E("Hip Thrust", "glutes", ["hamstrings"], "barbell"),
  E("Glute Bridge", "glutes", ["hamstrings"], "bodyweight"),
  E("Cable Pull-Through", "glutes", ["hamstrings"], "cable"),
  E("Standing Calf Raise", "calves", [], "machine"),
  E("Seated Calf Raise", "calves", [], "machine"),
  // Core
  E("Plank", "core", [], "bodyweight"),
  E("Hanging Leg Raise", "core", [], "bodyweight"),
  E("Cable Crunch", "core", [], "cable"),
  E("Ab Wheel Rollout", "core", [], "other"),
  E("Russian Twist", "core", [], "other"),
  E("Dead Bug", "core", [], "bodyweight"),
  // Full body
  E(
    "Kettlebell Swing",
    "full_body",
    ["glutes", "hamstrings", "core"],
    "kettlebell",
  ),
  E("Clean and Press", "full_body", ["shoulders", "quads", "back"], "barbell"),
  E("Burpee", "full_body", ["chest", "quads"], "bodyweight"),
  E("Farmer's Carry", "full_body", ["core", "back"], "dumbbell"),
  // Cardio
  E("Treadmill Run", "cardio", [], "machine", "cardio"),
  E("Stationary Bike", "cardio", [], "machine", "cardio"),
  E("Rowing Machine", "cardio", ["back", "quads"], "machine", "cardio"),
  E("Stair Climber", "cardio", ["quads", "glutes"], "machine", "cardio"),
  E("Jump Rope", "cardio", ["calves"], "other", "cardio"),
  // Mobility
  E("Couch Stretch", "quads", [], "bodyweight", "mobility"),
  E("Thoracic Extension", "back", [], "other", "mobility"),
  E("90/90 Hip Rotation", "glutes", [], "bodyweight", "mobility"),
];

const slugify = (value) =>
  value
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

const q = (value) => `'${String(value).replace(/'/g, "''")}'`;

const seen = new Set();
const rows = catalog.map((item) => {
  const slug = slugify(item.name);
  if (seen.has(slug)) throw new Error(`Duplicate slug: ${slug}`);
  seen.add(slug);

  return `  (${q(slug)}, ${q(slug)}, ${q(item.name)}, ${q(item.primary)}, ${q(
    JSON.stringify(item.secondary),
  )}, ${q(item.equipment)}, ${q(item.modality)}, ${item.unilateral ? 1 : 0}, NULL, unixepoch() * 1000)`;
});

const sql = `-- Shared exercise catalog.
-- Generated by scripts/gen-seed.mjs — edit that file, not this one.
--
-- Re-running this is safe: rows upsert on their slug id, so applying it to a
-- database that already has the catalog just refreshes the metadata.

INSERT INTO exercise
  (id, slug, name, primary_muscle, secondary_muscles, equipment, modality, is_unilateral, created_by, created_at)
VALUES
${rows.join(",\n")}
ON CONFLICT(id) DO UPDATE SET
  name = excluded.name,
  primary_muscle = excluded.primary_muscle,
  secondary_muscles = excluded.secondary_muscles,
  equipment = excluded.equipment,
  modality = excluded.modality,
  is_unilateral = excluded.is_unilateral;
`;

mkdirSync(new URL("../drizzle/seed/", import.meta.url), { recursive: true });
writeFileSync(new URL("../drizzle/seed/exercises.sql", import.meta.url), sql);
console.log(`Wrote ${rows.length} exercises to drizzle/seed/exercises.sql`);
