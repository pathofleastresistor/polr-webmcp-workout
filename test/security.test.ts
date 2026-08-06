import { describe, expect, it } from "vitest";

import {
  assertSameOrigin,
  normalizePublicRequest,
} from "~/server/security.server";

const APP_URL = "https://spotter.example";

/**
 * What a TLS-terminating reverse proxy actually delivers to the runtime: the
 * URL of the internal hop, on http, addressed to a container name.
 */
const proxied = (init: RequestInit = {}) =>
  new Request("http://spotter-container:8787/demo/start.data", {
    method: "POST",
    ...init,
  });

describe("normalizePublicRequest", () => {
  it("rewrites an internal hop URL to the public origin", () => {
    // React Router's single-fetch CSRF guard compares the Origin header's host
    // against new URL(request.url).host. Left alone, this request is rejected
    // with a bare 400 before any route code runs.
    const request = normalizePublicRequest(
      proxied({ headers: { Origin: APP_URL } }),
      APP_URL,
    );

    expect(new URL(request.url).host).toBe("spotter.example");
    expect(new URL(request.url).protocol).toBe("https:");
  });

  it("preserves the method, path and query", () => {
    const request = normalizePublicRequest(
      new Request("http://spotter-container:8787/api/workouts?limit=5", {
        method: "POST",
      }),
      APP_URL,
    );

    const url = new URL(request.url);
    expect(request.method).toBe("POST");
    expect(url.pathname).toBe("/api/workouts");
    expect(url.search).toBe("?limit=5");
  });

  it("restores the scheme the runtime stripped from a same-host Origin", () => {
    // Over a plaintext hop the runtime rewrites the browser's https Origin to
    // http, which then fails assertSameOrigin against the https APP_URL.
    const request = normalizePublicRequest(
      proxied({ headers: { Origin: "http://spotter.example" } }),
      APP_URL,
    );

    expect(request.headers.get("Origin")).toBe(APP_URL);
    expect(() => assertSameOrigin(request, APP_URL)).not.toThrow();
  });

  it("leaves a genuinely cross-origin request rejectable", () => {
    // The repair above must only ever touch the scheme of the deployment's own
    // host. A different host is another site, and must still be refused.
    const request = normalizePublicRequest(
      proxied({ headers: { Origin: "https://attacker.example" } }),
      APP_URL,
    );

    expect(request.headers.get("Origin")).toBe("https://attacker.example");
    expect(() => assertSameOrigin(request, APP_URL)).toThrow();
  });

  it("does not upgrade a look-alike host", () => {
    const request = normalizePublicRequest(
      proxied({ headers: { Origin: "https://spotter.example.evil.com" } }),
      APP_URL,
    );

    expect(request.headers.get("Origin")).toBe(
      "https://spotter.example.evil.com",
    );
    expect(() => assertSameOrigin(request, APP_URL)).toThrow();
  });

  it("returns the same request untouched when nothing needs fixing", () => {
    // The direct-to-origin case, including local dev, must not pay for this.
    const request = new Request("https://spotter.example/dashboard");

    expect(normalizePublicRequest(request, APP_URL)).toBe(request);
  });

  it("leaves the request alone when APP_URL is unusable", () => {
    // readConfig reports a malformed APP_URL; this must not throw on top of it.
    const request = proxied();

    expect(normalizePublicRequest(request, "not-a-url")).toBe(request);
  });

  it("keeps a distinct port as part of the origin", () => {
    const request = normalizePublicRequest(
      new Request("http://127.0.0.1:8787/dashboard"),
      "http://localhost:5173",
    );

    expect(new URL(request.url).host).toBe("localhost:5173");
  });
});
