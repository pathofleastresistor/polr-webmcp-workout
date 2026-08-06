import { beforeEach, describe, expect, it } from "vitest";

import {
  clientIp,
  enforceRateLimit,
  rateLimitKey,
  resetRateLimits,
} from "~/server/rate-limit.server";

const req = (headers: Record<string, string> = {}) =>
  new Request("https://spotter.example/api/workouts", {
    method: "POST",
    headers,
  });

describe("clientIp", () => {
  it("reads X-Forwarded-For, which the reverse proxy sets", () => {
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

describe("enforceRateLimit", () => {
  beforeEach(() => {
    resetRateLimits();
  });

  const spend = async (n: number, key = "user:a") => {
    for (let i = 0; i < n; i += 1) {
      await enforceRateLimit("AUTH_RATE_LIMIT", key);
    }
  };

  it("allows traffic up to the limit", async () => {
    await expect(spend(20)).resolves.toBeUndefined();
  });

  it("refuses the request that exceeds it, with a 429 and Retry-After", async () => {
    await spend(20);

    // The limiter signals by throwing a Response, which the handlers return
    // as-is, so the shape of that Response is part of the contract.
    const rejection = await enforceRateLimit("AUTH_RATE_LIMIT", "user:a").then(
      () => null,
      (error: unknown) => error,
    );

    expect(rejection).toBeInstanceOf(Response);
    const response = rejection as Response;
    expect(response.status).toBe(429);
    expect(Number(response.headers.get("Retry-After"))).toBeGreaterThan(0);
    await expect(response.json()).resolves.toMatchObject({
      error: "rate_limited",
    });
  });

  it("counts each key separately", async () => {
    // One noisy client must not spend anyone else's budget.
    await spend(20, "user:a");
    await expect(
      enforceRateLimit("AUTH_RATE_LIMIT", "user:b"),
    ).resolves.toBeUndefined();
  });

  it("counts each bucket separately", async () => {
    // Exhausting the tighter auth budget must leave tool calls usable.
    await spend(20, "user:a");
    await expect(
      enforceRateLimit("TOOL_RATE_LIMIT", "user:a"),
    ).resolves.toBeUndefined();
  });

  it("applies the wider limit to tool traffic", async () => {
    for (let i = 0; i < 120; i += 1) {
      await enforceRateLimit("TOOL_RATE_LIMIT", "user:a");
    }
    await expect(
      enforceRateLimit("TOOL_RATE_LIMIT", "user:a"),
    ).rejects.toBeInstanceOf(Response);
  });
});
