import { z } from "zod";

import { toolOk } from "../runtime";
import { useWebMcpTool } from "../use-tool";

/**
 * The one tool exposed before sign-in.
 *
 * An agent that lands here needs to learn two things quickly: what this service
 * does, and that it cannot proceed without the person completing Google
 * sign-in itself. Saying so explicitly stops an agent from burning turns
 * probing for an auth tool that deliberately does not exist — handing an agent
 * a way to authenticate would defeat the point of the consent boundary.
 */
export function useAnonymousTools() {
  useWebMcpTool({
    name: "get_service_overview",
    title: "About this service",
    description:
      "Explains what this workout service does and what tools become available after sign-in. Call it to decide whether this site can help with the person's request.",
    schema: z.object({}),
    annotations: { readOnlyHint: true, idempotentHint: true },
    activityLabel: () => "Read the service overview",
    execute: async () =>
      toolOk(
        [
          "Spotter is a workout tracker built to be driven by a person and their agent together.",
          "",
          "What you can do here once the person is signed in:",
          "- read their training history and per-muscle-group load (list_workouts, get_training_insights)",
          "- start a session (start_workout)",
          "- propose a full workout, which they review and accept (propose_workout_plan)",
          "- log each set as they do it (log_set)",
          "- close the session out (finish_workout)",
          "",
          "The person must sign in with Google themselves — there is no tool for it, by design. Ask them to press 'Continue with Google' on this page. Once they land on the dashboard, the tools above appear and you can call whoami to get started.",
        ].join("\n"),
        {
          requiresSignIn: true,
          signInMethod: "google",
          toolsAfterSignIn: [
            "whoami",
            "list_workouts",
            "get_workout",
            "get_training_insights",
            "search_exercises",
            "get_active_workout",
            "start_workout",
          ],
        },
      ),
  });
}
