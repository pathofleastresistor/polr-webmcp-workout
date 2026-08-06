/**
 * Pins an incoming request to the deployment's public origin.
 *
 * Behind a TLS-terminating reverse proxy the server only ever sees the last
 * hop: plaintext, addressed to a container name or localhost. Two things follow
 * from that, and together they make every mutation fail:
 *
 *  - The request URL the framework reconstructs is that internal address.
 *    React Router's single-fetch CSRF guard compares the `Origin` header's host
 *    against it, so a browser's form submission is rejected with a bare 400.
 *  - Some runtimes rewrite the `Origin` header's scheme to match the hop, so a
 *    browser's `https://` arrives as `http://` and fails `assertSameOrigin`
 *    against the https `APP_URL`.
 *
 * This runs at the server entry, not in route middleware, because the CSRF
 * guard reads the URL before any middleware executes.
 *
 * `APP_URL` is the source of truth rather than the `X-Forwarded-*` headers,
 * deliberately: a header the client controls must never be able to move the
 * origin those checks are measured against. Note this overwrites
 * `X-Forwarded-Proto` rather than reading it, so a forged one cannot influence
 * the result.
 *
 * Plain JavaScript rather than TypeScript because the server entry runs
 * directly under Node with no build step of its own.
 *
 * @param {{ headers: Record<string, string | string[] | undefined> }} req
 *   Any object carrying request headers — Node's IncomingMessage in production,
 *   a plain stub in tests.
 * @param {URL} appUrl Parsed, validated public origin.
 */
export function applyPublicOrigin(req, appUrl) {
  req.headers.host = appUrl.host;
  req.headers["x-forwarded-proto"] = appUrl.protocol.replace(":", "");

  const origin = req.headers.origin;
  if (typeof origin !== "string") return;

  // Only ever repair the scheme of an Origin that already names the public
  // host. A genuinely cross-origin request carries a different host, is left
  // untouched, and is still refused downstream — so this cannot mask an attack.
  try {
    if (new URL(origin).host === appUrl.host) {
      req.headers.origin = appUrl.origin;
    }
  } catch {
    // Malformed Origin: leave it exactly as sent so the app rejects it.
  }
}
