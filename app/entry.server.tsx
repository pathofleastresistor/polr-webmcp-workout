import { renderToReadableStream } from "react-dom/server";
import type { EntryContext, RouterContextProvider } from "react-router";
import { ServerRouter } from "react-router";
import { isbot } from "isbot";

import { nonceContext } from "./server/nonce";

const ABORT_DELAY = 10_000;

/**
 * Custom server entry, for one reason: the CSP nonce.
 *
 * React Router streams hydration data as inline `<script>` tags. Under the
 * strict `script-src` this app sets, those are blocked unless they carry the
 * response's nonce — and only `<ServerRouter nonce>` reaches them, since they
 * are emitted by the streaming renderer rather than by our components. Without
 * this file the page renders and then fails to hydrate in production.
 */
export default async function handleRequest(
  request: Request,
  responseStatusCode: number,
  responseHeaders: Headers,
  routerContext: EntryContext,
  loadContext: RouterContextProvider,
): Promise<Response> {
  const nonce = loadContext.get(nonceContext);

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), ABORT_DELAY);

  let didError = false;

  const stream = await renderToReadableStream(
    <ServerRouter context={routerContext} url={request.url} nonce={nonce} />,
    {
      nonce,
      signal: controller.signal,
      onError(error: unknown) {
        didError = true;
        // Logged here rather than surfaced: the error boundary has already
        // rendered something safe for the person, and the detail belongs in
        // the Worker's logs, not in the response body.
        console.error("Render error", error);
      },
    },
  );

  stream.allReady
    .then(() => clearTimeout(timeoutId))
    .catch(() => {
      clearTimeout(timeoutId);
    });

  // Crawlers and non-streaming agents get the fully rendered document; browsers
  // get the shell as soon as it is ready.
  if (isbot(request.headers.get("user-agent") ?? "")) {
    await stream.allReady;
  }

  responseHeaders.set("Content-Type", "text/html; charset=utf-8");

  return new Response(stream, {
    status: didError ? 500 : responseStatusCode,
    headers: responseHeaders,
  });
}
