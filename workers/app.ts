import { createRequestHandler, RouterContextProvider } from "react-router";

import { appContext, createAppContext } from "~/server/context";
import { nonceContext } from "~/server/nonce";
import {
  generateNonce,
  normalizePublicRequest,
} from "~/server/security.server";

const requestHandler = createRequestHandler(
  () => import("virtual:react-router/server-build"),
  import.meta.env.MODE,
);

export default {
  async fetch(request, env, ctx) {
    const context = new RouterContextProvider();

    let appRequest: Request;

    try {
      const app = createAppContext(env, ctx);
      context.set(appContext, app);

      // Must happen before the request reaches the router: React Router's own
      // single-fetch CSRF guard reads `request.url`, so a request still
      // carrying the internal hop's address is rejected before any route or
      // middleware of ours runs.
      appRequest = normalizePublicRequest(request, app.config.appUrl);
    } catch (error) {
      // Misconfiguration (missing secrets) — fail closed with no detail.
      console.error("Failed to build request context", error);
      return new Response("Service unavailable", {
        status: 503,
        headers: { "Cache-Control": "no-store" },
      });
    }

    context.set(nonceContext, generateNonce());

    return requestHandler(appRequest, context);
  },
} satisfies ExportedHandler<Env>;
