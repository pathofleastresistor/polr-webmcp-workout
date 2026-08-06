import { getAppContext } from "~/server/context";
import { enforceRateLimit, rateLimitKey } from "~/server/rate-limit.server";

import type { Route } from "./+types/api.auth";

/**
 * Better Auth owns every route under /api/auth: the Google redirect, the OAuth
 * callback, session lookups and sign-out. Handing it the raw Request keeps the
 * PKCE/state handling and cookie issuance inside the library rather than
 * reimplemented here.
 */
async function handle({ request, context }: Route.LoaderArgs) {
  const { auth, env } = getAppContext(context);

  // Unauthenticated endpoint reachable before a session exists, so the limiter
  // keys on IP. Guards the callback against credential-stuffing style replay.
  await enforceRateLimit(env, "AUTH_RATE_LIMIT", rateLimitKey(request, null));

  return auth.handler(request);
}

export const loader = handle;
export const action = handle;
