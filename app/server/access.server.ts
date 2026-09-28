import type { RouterContextProvider } from "react-router";

import type { UserProfile } from "~/db/schema";

import { getAppContext } from "./context";
import { enforceRateLimit, rateLimitKey } from "./rate-limit.server";
import { findUserByKey } from "./services/users.server";

export interface AuthenticatedUser {
  id: string;
  profile: UserProfile;
}

/**
 * Pages and resource routes all live under the person's private link,
 * `/w/<key>/…`. Reading the key from the path rather than from route params
 * lets every route — page, `.data` fetch or API call — authorize the same way
 * with no extra plumbing.
 */
const LINK_PREFIX = /^\/w\/([^/.]+)/;

export function keyFromRequest(request: Request): string | null {
  return LINK_PREFIX.exec(new URL(request.url).pathname)?.[1] ?? null;
}

/**
 * Resolves the owner of the link this request is under, or stops the request.
 *
 * An unknown link is a 404, not a 401: there is no sign-in to send anyone to,
 * and it should not read as "this exists but you can't see it". Misses are rate
 * limited per IP so the endpoint cannot be used to probe for links.
 */
export async function requireUser(
  request: Request,
  context: Readonly<RouterContextProvider>,
): Promise<AuthenticatedUser> {
  const { db } = getAppContext(context);

  const key = keyFromRequest(request);
  const user = key ? await findUserByKey(db, key) : null;
  if (user) return user;

  await enforceRateLimit("ANON_RATE_LIMIT", rateLimitKey(request, null));

  if (expectsJson(request)) {
    throw new Response(
      JSON.stringify({
        error: "unknown_link",
        message:
          "This link does not match any page. The person needs to open their own Spotter link; an agent cannot create or recover one.",
      }),
      { status: 404, headers: { "Content-Type": "application/json" } },
    );
  }

  throw new Response("Not found", { status: 404 });
}

function expectsJson(request: Request): boolean {
  if (request.method !== "GET" && request.method !== "HEAD") return true;
  const accept = request.headers.get("Accept") ?? "";
  return accept.includes("application/json");
}
