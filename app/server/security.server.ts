import type { MiddlewareFunction } from "react-router";

import { getAppContext } from "./context";
import { nonceContext } from "./nonce";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * Content Security Policy.
 *
 * `script-src` allows same-origin bundles plus a per-response nonce for the
 * inline hydration script React Router emits — no `unsafe-inline`. Workout
 * notes and titles are free text authored by the user (or by their agent),
 * which makes this the load-bearing control against stored XSS.
 *
 * `strict-dynamic` is deliberately omitted: it would disable the `'self'`
 * allowlist in CSP3 browsers and require every lazily imported route chunk to
 * carry a nonce, which the bundler does not do.
 */
function contentSecurityPolicy(nonce: string): string {
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}'`,
    "style-src 'self' 'unsafe-inline'",
    // Google profile pictures.
    "img-src 'self' data: https://lh3.googleusercontent.com",
    "font-src 'self'",
    "connect-src 'self'",
    "form-action 'self' https://accounts.google.com",
    "frame-ancestors 'none'",
    "base-uri 'none'",
    "object-src 'none'",
    "upgrade-insecure-requests",
  ].join("; ");
}

export function generateNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes));
}

/**
 * Rejects state-changing requests whose `Origin` is not this deployment.
 *
 * Session cookies are `SameSite=Lax`, which already blocks cross-site form
 * posts, but this closes the gap for same-site-but-different-origin callers and
 * gives a second, explicit layer. It matters more than usual here: WebMCP tools
 * issue same-origin `fetch` calls carrying the user's cookies, so a page that
 * managed to run in our origin could otherwise drive the whole API.
 */
export function assertSameOrigin(request: Request, appUrl: string): void {
  if (SAFE_METHODS.has(request.method)) return;

  const origin = request.headers.get("Origin");
  if (origin === null) {
    // Same-origin `fetch` and form posts always send Origin in browsers that
    // support WebMCP, so a missing header on a mutation is not a browser we
    // want to trust with a write.
    throw new Response("Missing Origin header", { status: 403 });
  }

  if (origin !== appUrl) {
    throw new Response("Cross-origin request rejected", { status: 403 });
  }
}

/**
 * Root middleware: enforces origin on mutations and stamps security headers on
 * every response.
 */
export const securityMiddleware: MiddlewareFunction<Response> = async (
  { request, context },
  next,
) => {
  const { config } = getAppContext(context);

  assertSameOrigin(request, config.appUrl);

  const response = await next();
  const headers = response.headers;

  const nonce = context.get(nonceContext);
  headers.set("Content-Security-Policy", contentSecurityPolicy(nonce));
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  headers.set("X-Frame-Options", "DENY");
  headers.set(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
  );
  headers.set("Cross-Origin-Opener-Policy", "same-origin");
  headers.set("Cross-Origin-Resource-Policy", "same-origin");

  if (config.useSecureCookies) {
    headers.set(
      "Strict-Transport-Security",
      "max-age=63072000; includeSubDomains; preload",
    );
  }

  return response;
};

export { nonceContext };
