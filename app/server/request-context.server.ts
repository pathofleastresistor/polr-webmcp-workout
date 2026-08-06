import type { MiddlewareFunction } from "react-router";

import { appContext, createAppContext } from "./context";
import { nonceContext } from "./nonce";
import { generateNonce } from "./security.server";

/**
 * Establishes what the rest of the request depends on: the application context
 * and the CSP nonce.
 *
 * This is middleware rather than server-adapter code so the Node entry stays a
 * plain handler mount with no knowledge of the app. It must come first in the
 * chain — `securityMiddleware` reads the config it puts in place.
 *
 * The request's public origin is *not* fixed up here. React Router's own
 * single-fetch CSRF guard reads `request.url` before any route middleware
 * runs, so by this point it is already too late; that happens at the server
 * entry instead (see server/public-origin.mjs).
 */
export const requestContextMiddleware: MiddlewareFunction<Response> = async (
  { context },
  next,
) => {
  try {
    context.set(appContext, createAppContext());
  } catch (error) {
    // Misconfiguration (missing secrets) — fail closed with no detail.
    console.error("Failed to build request context", error);
    return new Response("Service unavailable", {
      status: 503,
      headers: { "Cache-Control": "no-store" },
    });
  }

  context.set(nonceContext, generateNonce());

  return next();
};
