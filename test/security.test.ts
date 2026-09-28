import { describe, expect, it } from "vitest";

import { assertSameOrigin } from "~/server/security.server";

import { applyPublicOrigin } from "../server/public-origin.mjs";

const APP_URL = "https://spotter.example";
const appUrl = new URL(APP_URL);

/**
 * What a TLS-terminating reverse proxy actually delivers: the internal hop, on
 * plaintext, addressed to a container name.
 */
const proxied = (headers: Record<string, string> = {}) => ({
  headers: {
    host: "spotter-container:8787",
    "x-forwarded-proto": "http",
    ...headers,
  } as Record<string, string>,
});

/** The Fetch Request the Express adapter builds from those headers. */
const requestFrom = (req: { headers: Record<string, string> }) =>
  new Request(
    `${req.headers["x-forwarded-proto"]}://${req.headers.host}/_root.data`,
    {
      method: "POST",
      headers: req.headers.origin ? { Origin: req.headers.origin } : {},
    },
  );

describe("applyPublicOrigin", () => {
  it("rewrites an internal hop to the public origin", () => {
    // React Router's single-fetch CSRF guard compares the Origin header's host
    // against new URL(request.url).host. Left alone, a browser's submission is
    // rejected with a bare 400 before any route code runs.
    const req = proxied({ origin: APP_URL });
    applyPublicOrigin(req, appUrl);

    const url = new URL(requestFrom(req).url);
    expect(url.host).toBe("spotter.example");
    expect(url.protocol).toBe("https:");
  });

  it("keeps a non-default port as part of the origin", () => {
    const req = proxied();
    applyPublicOrigin(req, new URL("http://localhost:5173"));

    expect(new URL(requestFrom(req).url).host).toBe("localhost:5173");
  });

  it("restores the scheme stripped from a same-host Origin", () => {
    // Over a plaintext hop the browser's https Origin can arrive as http,
    // which then fails assertSameOrigin against the https APP_URL.
    const req = proxied({ origin: "http://spotter.example" });
    applyPublicOrigin(req, appUrl);

    expect(req.headers.origin).toBe(APP_URL);
    expect(() => assertSameOrigin(requestFrom(req), APP_URL)).not.toThrow();
  });

  it("leaves a genuinely cross-origin request rejectable", () => {
    // The repair above must only ever touch the scheme of this deployment's
    // own host. Another host is another site, and must still be refused.
    const req = proxied({ origin: "https://attacker.example" });
    applyPublicOrigin(req, appUrl);

    expect(req.headers.origin).toBe("https://attacker.example");
    expect(() => assertSameOrigin(requestFrom(req), APP_URL)).toThrow();
  });

  it("does not upgrade a look-alike host", () => {
    const req = proxied({ origin: "https://spotter.example.evil.com" });
    applyPublicOrigin(req, appUrl);

    expect(req.headers.origin).toBe("https://spotter.example.evil.com");
    expect(() => assertSameOrigin(requestFrom(req), APP_URL)).toThrow();
  });

  it("overwrites a forged X-Forwarded-Proto rather than trusting it", () => {
    // The public scheme comes from APP_URL alone. A client that sets this
    // header must not be able to move the origin the checks are measured on.
    const req = proxied({ "x-forwarded-proto": "https" });
    applyPublicOrigin(req, new URL("http://localhost:5173"));

    expect(req.headers["x-forwarded-proto"]).toBe("http");
  });

  it("leaves a malformed Origin untouched for the app to reject", () => {
    const req = proxied({ origin: "not-a-url" });
    applyPublicOrigin(req, appUrl);

    expect(req.headers.origin).toBe("not-a-url");
    expect(() => assertSameOrigin(requestFrom(req), APP_URL)).toThrow();
  });
});

describe("assertSameOrigin", () => {
  const post = (headers: Record<string, string> = {}) =>
    new Request(`${APP_URL}/api/workouts`, { method: "POST", headers });

  it("allows a same-origin mutation", () => {
    expect(() =>
      assertSameOrigin(post({ Origin: APP_URL }), APP_URL),
    ).not.toThrow();
  });

  it("ignores safe methods, which carry no Origin requirement", () => {
    const get = new Request(`${APP_URL}/dashboard`);
    expect(() => assertSameOrigin(get, APP_URL)).not.toThrow();
  });

  it("refuses a mutation with no Origin at all", () => {
    expect(() => assertSameOrigin(post(), APP_URL)).toThrow();
  });
});
