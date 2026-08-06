import { insightsInput } from "~/domain/contracts";
import { handleApiRequest } from "~/server/api-handler.server";
import { getInsights } from "~/server/services/insights.server";

import type { Route } from "./+types/api.insights";

export async function loader({ request, context }: Route.LoaderArgs) {
  return handleApiRequest(request, context, {
    schema: insightsInput,
    handle: ({ input, user, db }) =>
      getInsights(db, user.id, user.profile, input),
  });
}
