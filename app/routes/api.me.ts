import { eq } from "drizzle-orm";

import { userProfile } from "~/db/schema";
import { updateProfileInput } from "~/domain/contracts";
import type { ProfileView } from "~/domain/types";
import { handleApiRequest } from "~/server/api-handler.server";
import { requireUser, type AuthenticatedUser } from "~/server/access.server";

import type { Route } from "./+types/api.me";

export async function loader({ request, context }: Route.LoaderArgs) {
  const user = await requireUser(request, context);
  return Response.json(toProfileView(user), {
    headers: { "Cache-Control": "private, no-store" },
  });
}

export async function action({ request, context }: Route.ActionArgs) {
  if (request.method !== "PATCH") {
    return Response.json(
      { error: "method_not_allowed", message: "Use PATCH to update settings." },
      { status: 405, headers: { Allow: "PATCH" } },
    );
  }

  return handleApiRequest(request, context, {
    schema: updateProfileInput,
    handle: async ({ input, user, db }) => {
      const [updated] = await db
        .update(userProfile)
        .set({ ...input, updatedAt: new Date() })
        .where(eq(userProfile.userId, user.id))
        .returning();

      return toProfileView({ ...user, profile: updated ?? user.profile });
    },
  });
}

function toProfileView(user: AuthenticatedUser): ProfileView {
  return {
    id: user.id,
    unitSystem: user.profile.unitSystem,
    experienceLevel: user.profile.experienceLevel,
    goal: user.profile.goal,
    timezone: user.profile.timezone,
    weeklyTargetSessions: user.profile.weeklyTargetSessions,
  };
}
