import { relations, sql } from "drizzle-orm";
import {
  index,
  integer,
  real,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

/**
 * Timestamps are stored as epoch milliseconds so Drizzle hands back real `Date`
 * objects on both the auth tables (which Better Auth requires) and our own.
 */
const timestampMs = (column: string) =>
  integer(column, { mode: "timestamp_ms" });

const createdAt = () =>
  timestampMs("created_at")
    .notNull()
    .default(sql`(unixepoch() * 1000)`);

const updatedAt = () =>
  timestampMs("updated_at")
    .notNull()
    .default(sql`(unixepoch() * 1000)`);

/* -------------------------------------------------------------------------- */
/* Better Auth core tables                                                    */
/* -------------------------------------------------------------------------- */
/*
 * Field names mirror Better Auth's `getAuthTables()` contract exactly. The
 * Drizzle adapter resolves columns by *property* name, so the camelCase keys
 * below are load-bearing even though the SQL columns are snake_case.
 */

export const user = sqliteTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: integer("email_verified", { mode: "boolean" })
    .notNull()
    .default(false),
  image: text("image"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const session = sqliteTable(
  "session",
  {
    id: text("id").primaryKey(),
    expiresAt: timestampMs("expires_at").notNull(),
    token: text("token").notNull().unique(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
  },
  (table) => [
    index("session_user_id_idx").on(table.userId),
    index("session_expires_at_idx").on(table.expiresAt),
  ],
);

export const account = sqliteTable(
  "account",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestampMs("access_token_expires_at"),
    refreshTokenExpiresAt: timestampMs("refresh_token_expires_at"),
    scope: text("scope"),
    password: text("password"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    index("account_user_id_idx").on(table.userId),
    uniqueIndex("account_provider_account_idx").on(
      table.providerId,
      table.accountId,
    ),
  ],
);

export const verification = sqliteTable(
  "verification",
  {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: timestampMs("expires_at").notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [index("verification_identifier_idx").on(table.identifier)],
);

/* -------------------------------------------------------------------------- */
/* Product tables                                                             */
/* -------------------------------------------------------------------------- */

export const UNIT_SYSTEMS = ["metric", "imperial"] as const;
export type UnitSystem = (typeof UNIT_SYSTEMS)[number];

export const EXPERIENCE_LEVELS = [
  "beginner",
  "intermediate",
  "advanced",
] as const;
export type ExperienceLevel = (typeof EXPERIENCE_LEVELS)[number];

export const userProfile = sqliteTable("user_profile", {
  userId: text("user_id")
    .primaryKey()
    .references(() => user.id, { onDelete: "cascade" }),
  unitSystem: text("unit_system", { enum: UNIT_SYSTEMS })
    .notNull()
    .default("metric"),
  experienceLevel: text("experience_level", { enum: EXPERIENCE_LEVELS })
    .notNull()
    .default("beginner"),
  /** Free-text training goal, authored by the user. Treat as untrusted content. */
  goal: text("goal"),
  timezone: text("timezone").notNull().default("UTC"),
  weeklyTargetSessions: integer("weekly_target_sessions").notNull().default(3),
  /**
   * Marks a throwaway account minted by /demo/start. Sessions belonging to one
   * are rejected whenever demo mode is off, so turning DEMO_MODE off on a
   * deployment that previously ran a demo revokes those logins rather than
   * leaving them valid against the same signing secret.
   */
  isDemo: integer("is_demo", { mode: "boolean" }).notNull().default(false),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const MODALITIES = ["strength", "cardio", "mobility"] as const;
export type Modality = (typeof MODALITIES)[number];

export const MUSCLE_GROUPS = [
  "chest",
  "back",
  "shoulders",
  "biceps",
  "triceps",
  "quads",
  "hamstrings",
  "glutes",
  "calves",
  "core",
  "full_body",
  "cardio",
] as const;
export type MuscleGroup = (typeof MUSCLE_GROUPS)[number];

/**
 * Exercise catalog. Rows with a null `createdBy` are the shared library; rows
 * with a `createdBy` are private to that user.
 */
export const exercise = sqliteTable(
  "exercise",
  {
    id: text("id").primaryKey(),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    primaryMuscle: text("primary_muscle", { enum: MUSCLE_GROUPS }).notNull(),
    secondaryMuscles: text("secondary_muscles", { mode: "json" })
      .$type<MuscleGroup[]>()
      .notNull()
      .default(sql`'[]'`),
    equipment: text("equipment").notNull().default("bodyweight"),
    modality: text("modality", { enum: MODALITIES })
      .notNull()
      .default("strength"),
    isUnilateral: integer("is_unilateral", { mode: "boolean" })
      .notNull()
      .default(false),
    createdBy: text("created_by").references(() => user.id, {
      onDelete: "cascade",
    }),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex("exercise_slug_owner_idx").on(table.slug, table.createdBy),
    index("exercise_primary_muscle_idx").on(table.primaryMuscle),
  ],
);

export const WORKOUT_STATUSES = ["active", "completed", "abandoned"] as const;
export type WorkoutStatus = (typeof WORKOUT_STATUSES)[number];

/** Who initiated a change: the person directly, or their agent via WebMCP. */
export const ACTORS = ["human", "agent"] as const;
export type Actor = (typeof ACTORS)[number];

export const workout = sqliteTable(
  "workout",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    title: text("title").notNull().default("Workout"),
    status: text("status", { enum: WORKOUT_STATUSES })
      .notNull()
      .default("active"),
    /** Free-text, user- or agent-authored. Treat as untrusted content. */
    notes: text("notes"),
    /** Whether the plan was drafted by the person or proposed by their agent. */
    plannedBy: text("planned_by", { enum: ACTORS }),
    startedAt: timestampMs("started_at").notNull(),
    completedAt: timestampMs("completed_at"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    index("workout_user_started_idx").on(table.userId, table.startedAt),
    index("workout_user_status_idx").on(table.userId, table.status),
  ],
);

export const workoutExercise = sqliteTable(
  "workout_exercise",
  {
    id: text("id").primaryKey(),
    workoutId: text("workout_id")
      .notNull()
      .references(() => workout.id, { onDelete: "cascade" }),
    exerciseId: text("exercise_id")
      .notNull()
      .references(() => exercise.id, { onDelete: "restrict" }),
    position: integer("position").notNull(),
    targetSets: integer("target_sets"),
    targetReps: integer("target_reps"),
    targetWeightKg: real("target_weight_kg"),
    /** Why the agent chose this exercise; surfaced in the UI for the human. */
    rationale: text("rationale"),
    createdAt: createdAt(),
  },
  (table) => [
    index("workout_exercise_workout_idx").on(table.workoutId),
    uniqueIndex("workout_exercise_position_idx").on(
      table.workoutId,
      table.position,
    ),
  ],
);

export const SET_STATUSES = ["pending", "completed", "skipped"] as const;
export type SetStatus = (typeof SET_STATUSES)[number];

export const workoutSet = sqliteTable(
  "workout_set",
  {
    id: text("id").primaryKey(),
    workoutExerciseId: text("workout_exercise_id")
      .notNull()
      .references(() => workoutExercise.id, { onDelete: "cascade" }),
    setIndex: integer("set_index").notNull(),
    weightKg: real("weight_kg"),
    reps: integer("reps"),
    /** Rate of perceived exertion, 1-10. */
    rpe: real("rpe"),
    durationSeconds: integer("duration_seconds"),
    distanceMeters: real("distance_meters"),
    isWarmup: integer("is_warmup", { mode: "boolean" })
      .notNull()
      .default(false),
    status: text("status", { enum: SET_STATUSES }).notNull().default("pending"),
    loggedBy: text("logged_by", { enum: ACTORS }),
    completedAt: timestampMs("completed_at"),
    createdAt: createdAt(),
  },
  (table) => [
    index("workout_set_exercise_idx").on(table.workoutExerciseId),
    uniqueIndex("workout_set_index_idx").on(
      table.workoutExerciseId,
      table.setIndex,
    ),
  ],
);

/**
 * Append-only audit trail of every WebMCP tool call. This is both a security
 * record (what did the agent do on the user's behalf) and the data behind the
 * in-app activity feed that keeps the human in the loop.
 */
export const agentEvent = sqliteTable(
  "agent_event",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    workoutId: text("workout_id").references(() => workout.id, {
      onDelete: "cascade",
    }),
    toolName: text("tool_name").notNull(),
    actor: text("actor", { enum: ACTORS }).notNull().default("agent"),
    /** Redacted argument snapshot; see app/server/services/audit.server.ts. */
    args: text("args", { mode: "json" }).$type<Record<string, unknown>>(),
    summary: text("summary").notNull(),
    outcome: text("outcome", { enum: ["ok", "error", "denied"] })
      .notNull()
      .default("ok"),
    createdAt: createdAt(),
  },
  (table) => [
    index("agent_event_user_created_idx").on(table.userId, table.createdAt),
  ],
);

/* -------------------------------------------------------------------------- */
/* Relations                                                                  */
/* -------------------------------------------------------------------------- */

export const userRelations = relations(user, ({ one, many }) => ({
  profile: one(userProfile, {
    fields: [user.id],
    references: [userProfile.userId],
  }),
  workouts: many(workout),
}));

export const workoutRelations = relations(workout, ({ one, many }) => ({
  user: one(user, { fields: [workout.userId], references: [user.id] }),
  exercises: many(workoutExercise),
}));

export const workoutExerciseRelations = relations(
  workoutExercise,
  ({ one, many }) => ({
    workout: one(workout, {
      fields: [workoutExercise.workoutId],
      references: [workout.id],
    }),
    exercise: one(exercise, {
      fields: [workoutExercise.exerciseId],
      references: [exercise.id],
    }),
    sets: many(workoutSet),
  }),
);

export const workoutSetRelations = relations(workoutSet, ({ one }) => ({
  workoutExercise: one(workoutExercise, {
    fields: [workoutSet.workoutExerciseId],
    references: [workoutExercise.id],
  }),
}));

export const schema = {
  user,
  session,
  account,
  verification,
  userProfile,
  exercise,
  workout,
  workoutExercise,
  workoutSet,
  agentEvent,
  userRelations,
  workoutRelations,
  workoutExerciseRelations,
  workoutSetRelations,
};

export type User = typeof user.$inferSelect;
export type UserProfile = typeof userProfile.$inferSelect;
export type Exercise = typeof exercise.$inferSelect;
export type Workout = typeof workout.$inferSelect;
export type WorkoutExercise = typeof workoutExercise.$inferSelect;
export type WorkoutSet = typeof workoutSet.$inferSelect;
export type AgentEvent = typeof agentEvent.$inferSelect;
