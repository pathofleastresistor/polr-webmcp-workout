import { type RouteConfig, index, route } from "@react-router/dev/routes";

export default [
  // One button that makes a private link and sends you to it.
  index("routes/home.tsx"),

  // Everything a person owns lives under their link. The key in the path is
  // the whole of authentication; see app/server/access.server.ts.
  route("w/:key", "routes/dashboard.tsx"),
  route("w/:key/workout/:workoutId", "routes/workout.tsx"),
  route("w/:key/settings", "routes/settings.tsx"),

  // Resource routes. These are the single server-side surface shared by the UI
  // and by the WebMCP tools, so a tool call and a button click take the exact
  // same validated, authorized path.
  route("w/:key/api/me", "routes/api.me.ts"),
  route("w/:key/api/exercises", "routes/api.exercises.ts"),
  route("w/:key/api/insights", "routes/api.insights.ts"),
  route("w/:key/api/workouts", "routes/api.workouts.ts"),
  route("w/:key/api/workouts/:workoutId", "routes/api.workouts.$workoutId.ts"),
  route(
    "w/:key/api/workouts/:workoutId/sets",
    "routes/api.workouts.$workoutId.sets.ts",
  ),
] satisfies RouteConfig;
