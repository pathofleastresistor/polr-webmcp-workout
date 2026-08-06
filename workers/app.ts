import { createRequestHandler, RouterContextProvider } from "react-router";

import { appContext, createAppContext } from "~/server/context";
import { nonceContext } from "~/server/nonce";
import { generateNonce } from "~/server/security.server";

const requestHandler = createRequestHandler(
  () => import("virtual:react-router/server-build"),
  import.meta.env.MODE,
);

export default {
  async fetch(request, env, ctx) {
    const context = new RouterContextProvider();

    try {
      context.set(appContext, createAppContext(env, ctx));
    } catch (error) {
      // Misconfiguration (missing secrets) — fail closed with no detail.
      console.error("Failed to build request context", error);
      return new Response("Service unavailable", {
        status: 503,
        headers: { "Cache-Control": "no-store" },
      });
    }

    context.set(nonceContext, generateNonce());

    return requestHandler(request, context);
  },
} satisfies ExportedHandler<Env>;
