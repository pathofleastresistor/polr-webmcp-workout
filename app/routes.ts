import { type RouteConfig, index, route } from "@react-router/dev/routes";

export default [
  index("routes/home.tsx"),
  route("dashboard", "routes/dashboard.tsx"),
  route("workout/:workoutId", "routes/workout.tsx"),
  route("settings", "routes/settings.tsx"),

  // Better Auth owns everything under /api/auth (Google redirect, callback,
  // session, sign-out).
  route("api/auth/*", "routes/api.auth.ts"),

  // Resource routes. These are the single server-side surface shared by the UI
  // and by the WebMCP tools, so a tool call and a button click take the exact
  // same validated, authorized path.
  route("api/me", "routes/api.me.ts"),
  route("api/exercises", "routes/api.exercises.ts"),
  route("api/insights", "routes/api.insights.ts"),
  route("api/workouts", "routes/api.workouts.ts"),
  route("api/workouts/:workoutId", "routes/api.workouts.$workoutId.ts"),
  route(
    "api/workouts/:workoutId/sets",
    "routes/api.workouts.$workoutId.sets.ts",
  ),
] satisfies RouteConfig;
