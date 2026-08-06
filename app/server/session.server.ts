import { redirect, type RouterContextProvider } from "react-router";

import type { UserProfile } from "~/db/schema";
import { userProfile } from "~/db/schema";

import { getAppContext } from "./context";

export interface AuthenticatedUser {
  id: string;
  name: string;
  email: string;
  image: string | null;
  profile: UserProfile;
}

/**
 * Resolves the signed-in user from the session cookie, or `null` when the
 * request is anonymous. Never throws for unauthenticated requests — callers
 * choose between `requireUser` and a soft check.
 */
export async function getOptionalUser(
  request: Request,
  context: Readonly<RouterContextProvider>,
): Promise<AuthenticatedUser | null> {
  const { auth, db } = getAppContext(context);

  const result = await auth.api.getSession({ headers: request.headers });
  if (!result?.user) return null;

  const profile = await ensureProfile(db, result.user.id);

  return {
    id: result.user.id,
    name: result.user.name,
    email: result.user.email,
    image: result.user.image ?? null,
    profile,
  };
}

/**
 * Resolves the signed-in user or stops the request.
 *
 * Document requests are redirected to the landing page so the person can sign
 * in; data requests (WebMCP tool calls and `fetch` from the UI) get a 401 so the
 * caller can surface a real error instead of parsing an HTML login page.
 */
export async function requireUser(
  request: Request,
  context: Readonly<RouterContextProvider>,
): Promise<AuthenticatedUser> {
  const user = await getOptionalUser(request, context);
  if (user) return user;

  if (expectsJson(request)) {
    throw new Response(
      JSON.stringify({
        error: "unauthenticated",
        message:
          "Sign in with Google at / before calling this tool. The person needs to complete sign-in in the browser; an agent cannot do it on their behalf.",
      }),
      { status: 401, headers: { "Content-Type": "application/json" } },
    );
  }

  const url = new URL(request.url);
  throw redirect(`/?next=${encodeURIComponent(url.pathname + url.search)}`);
}

function expectsJson(request: Request): boolean {
  if (request.method !== "GET" && request.method !== "HEAD") return true;
  const accept = request.headers.get("Accept") ?? "";
  return accept.includes("application/json");
}

/**
 * Lazily creates the profile row on first authenticated request. Better Auth
 * owns the `user` row; preferences live alongside it and default on read so a
 * failed hook can never leave an account without settings.
 */
async function ensureProfile(
  db: ReturnType<typeof getAppContext>["db"],
  userId: string,
): Promise<UserProfile> {
  const existing = await db.query.userProfile.findFirst({
    where: (profile, { eq }) => eq(profile.userId, userId),
  });
  if (existing) return existing;

  const [created] = await db
    .insert(userProfile)
    .values({ userId })
    .onConflictDoNothing()
    .returning();

  if (created) return created;

  // Lost a race with a concurrent request; the row now exists.
  const row = await db.query.userProfile.findFirst({
    where: (profile, { eq }) => eq(profile.userId, userId),
  });
  if (!row) throw new Error(`Failed to create profile for user ${userId}`);
  return row;
}
