import { z } from "zod";

import { toolOk } from "../runtime";
import { useWebMcpTool } from "../use-tool";

/**
 * The one tool exposed on the landing page.
 *
 * An agent that lands here needs to learn two things quickly: what this service
 * does, and that the person has to open their own private link. Saying so
 * explicitly stops an agent from burning turns probing for a tool that
 * deliberately does not exist — the link is the person's to make and keep.
 */
export function useAnonymousTools() {
  useWebMcpTool({
    name: "get_service_overview",
    title: "About this service",
    description:
      "Explains what this workout service does and what tools become available on the person's page. Call it to decide whether this site can help with the person's request.",
    schema: z.object({}),
    annotations: { readOnlyHint: true, idempotentHint: true },
    activityLabel: () => "Read the service overview",
    execute: async () =>
      toolOk(
        [
          "Spotter is a workout tracker built to be driven by a person and their agent together.",
          "",
          "What you can do on the person's page:",
          "- read their training history and per-muscle-group load (list_workouts, get_training_insights)",
          "- start a session (start_workout)",
          "- propose a full workout, which they review and accept (propose_workout_plan)",
          "- log each set as they do it (log_set)",
          "- close the session out (finish_workout)",
          "",
          "Each person has a private link (/w/…) that is their whole account. If they have one, ask them to open it. If not, ask them to press 'Make my page' here — there is no tool for it, by design. Once their page is open, the tools above appear and you can call whoami to get started.",
        ].join("\n"),
        {
          requiresPrivateLink: true,
          toolsOnPage: [
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
