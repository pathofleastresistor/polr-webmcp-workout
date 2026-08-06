import { describe, expect, it } from "vitest";

import { clientIp, rateLimitKey } from "~/server/rate-limit.server";

const req = (headers: Record<string, string> = {}) =>
  new Request("https://spotter.example/api/workouts", {
    method: "POST",
    headers,
  });

describe("clientIp", () => {
  it("prefers Cloudflare's header, which the edge sets and clients cannot forge", () => {
    expect(
      clientIp(
        req({
          "CF-Connecting-IP": "203.0.113.7",
          "X-Forwarded-For": "198.51.100.9",
        }),
      ),
    ).toBe("203.0.113.7");
  });

  it("falls back to X-Forwarded-For when self-hosted behind a proxy", () => {
    expect(clientIp(req({ "X-Forwarded-For": "203.0.113.7" }))).toBe(
      "203.0.113.7",
    );
  });

  it("takes the rightmost hop so a client cannot forge its own bucket", () => {
    // A caller prepended two fake addresses; the proxy appended the one it
    // actually saw. Trusting the left entry would let every request claim a
    // fresh rate-limit key.
    expect(
      clientIp(req({ "X-Forwarded-For": "1.1.1.1, 2.2.2.2, 203.0.113.7" })),
    ).toBe("203.0.113.7");
  });

  it("tolerates whitespace and empty entries", () => {
    expect(
      clientIp(req({ "X-Forwarded-For": " 1.1.1.1 ,  , 203.0.113.7 " })),
    ).toBe("203.0.113.7");
    expect(clientIp(req({ "X-Forwarded-For": "" }))).toBeNull();
  });

  it("is null when no proxy header is present", () => {
    expect(clientIp(req())).toBeNull();
  });
});

describe("rateLimitKey", () => {
  it("keys on the user when signed in, regardless of address", () => {
    // A signed-in person moving between networks keeps one budget.
    expect(
      rateLimitKey(req({ "X-Forwarded-For": "203.0.113.7" }), "user-1"),
    ).toBe("user:user-1");
  });

  it("keys on the client address when anonymous", () => {
    expect(rateLimitKey(req({ "X-Forwarded-For": "203.0.113.7" }), null)).toBe(
      "ip:203.0.113.7",
    );
  });

  it("still returns a bounded key when the address is unknown", () => {
    expect(rateLimitKey(req(), null)).toBe("ip:unknown");
  });
});
