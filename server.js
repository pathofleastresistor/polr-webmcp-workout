/**
 * Production server.
 *
 * Plain Node with Express: the app is a standard SSR application, so it runs
 * anywhere Node does — a container, a VM, a PaaS — rather than on one vendor's
 * runtime. Nothing here is aware of the app beyond mounting its handler.
 *
 * Development does not use this file; `react-router dev` serves through Vite.
 */
import { createRequestHandler } from "@react-router/express";
import express from "express";

import * as build from "./build/server/index.js";
import { applyPublicOrigin } from "./server/public-origin.mjs";

const port = Number(process.env.PORT ?? 3000);
const host = process.env.HOST ?? "0.0.0.0";

if (!process.env.APP_URL) {
  console.error(
    "spotter: APP_URL is not set. It must be the public origin browsers use, e.g. https://spotter.example.com (no trailing slash).",
  );
  process.exit(1);
}

let appUrl;
try {
  appUrl = new URL(process.env.APP_URL);
} catch {
  console.error(`spotter: APP_URL is not a valid URL: ${process.env.APP_URL}`);
  process.exit(1);
}

const app = express();

// The app sets its own security headers per response; Express's default
// `X-Powered-By` is the one thing it cannot remove from here.
app.disable("x-powered-by");

// Trust the proxy for the client address, which the rate limiter keys on. The
// public origin is *not* taken from these headers — see applyPublicOrigin.
app.set("trust proxy", true);

app.use((req, _res, next) => {
  applyPublicOrigin(req, appUrl);
  next();
});

// Fingerprinted assets are immutable; everything else in the client build is
// revalidated so a deploy is picked up immediately.
app.use(
  "/assets",
  express.static("build/client/assets", {
    immutable: true,
    maxAge: "1y",
  }),
);
app.use(express.static("build/client", { maxAge: "1h" }));

app.all("*splat", createRequestHandler({ build }));

app.listen(port, host, () => {
  console.log(`spotter: serving on ${host}:${port} (APP_URL=${appUrl.origin})`);
});
