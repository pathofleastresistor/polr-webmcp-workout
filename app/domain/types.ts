import type {
  Actor,
  ExperienceLevel,
  Modality,
  MuscleGroup,
  SetStatus,
  UnitSystem,
  WorkoutStatus,
} from "~/db/schema";

/**
 * Serialisable view models shared by loaders, resource routes and WebMCP tool
 * results. Dates are ISO strings so a tool result is valid JSON without a
 * custom serialiser.
 */

export interface ExerciseView {
  id: string;
  slug: string;
  name: string;
  primaryMuscle: MuscleGroup;
  secondaryMuscles: MuscleGroup[];
  equipment: string;
  modality: Modality;
  isCustom: boolean;
}

export interface SetView {
  id: string;
  setIndex: number;
  weightKg: number | null;
  reps: number | null;
  rpe: number | null;
  durationSeconds: number | null;
  distanceMeters: number | null;
  isWarmup: boolean;
  status: SetStatus;
  loggedBy: Actor | null;
  completedAt: string | null;
}

export interface WorkoutExerciseView {
  id: string;
  position: number;
  exercise: ExerciseView;
  targetSets: number | null;
  targetReps: number | null;
  targetWeightKg: number | null;
  rationale: string | null;
  sets: SetView[];
}

export interface WorkoutSummaryView {
  id: string;
  title: string;
  status: WorkoutStatus;
  plannedBy: Actor | null;
  startedAt: string;
  completedAt: string | null;
  exerciseCount: number;
  completedSets: number;
  totalVolumeKg: number;
  durationMinutes: number | null;
}

export interface WorkoutDetailView extends WorkoutSummaryView {
  notes: string | null;
  exercises: WorkoutExerciseView[];
}

export interface ProfileView {
  id: string;
  name: string;
  email: string;
  image: string | null;
  unitSystem: UnitSystem;
  experienceLevel: ExperienceLevel;
  goal: string | null;
  timezone: string;
  weeklyTargetSessions: number;
}

export interface MuscleGroupLoad {
  muscleGroup: MuscleGroup;
  sets: number;
  volumeKg: number;
  daysSinceLastTrained: number | null;
}

export interface PersonalRecord {
  exerciseId: string;
  exerciseName: string;
  bestWeightKg: number | null;
  bestReps: number | null;
  estimatedOneRepMaxKg: number | null;
  achievedAt: string;
}

export interface InsightsView {
  windowWeeks: number;
  totalWorkouts: number;
  totalSets: number;
  totalVolumeKg: number;
  averageSessionsPerWeek: number;
  weeklyTargetSessions: number;
  currentStreakWeeks: number;
  lastWorkoutAt: string | null;
  daysSinceLastWorkout: number | null;
  muscleGroupLoad: MuscleGroupLoad[];
  /** Muscle groups trained least recently — the agent's cue for what to program. */
  underworkedMuscleGroups: MuscleGroup[];
  personalRecords: PersonalRecord[];
}

export interface AgentEventView {
  id: string;
  toolName: string;
  actor: Actor;
  summary: string;
  outcome: "ok" | "error" | "denied";
  workoutId: string | null;
  createdAt: string;
}
