import { describe, expect, it, vi } from "vitest";

import { readConfig, type AppEnv } from "~/server/env.server";

const SECRET = "a".repeat(32);

/** Only the fields readConfig looks at. */
const env = (overrides: Partial<AppEnv>): AppEnv => ({
  APP_URL: "https://spotter.example",
  ...overrides,
});

describe("readConfig", () => {
  it("accepts a fully configured deployment", () => {
    const config = readConfig(
      env({
        BETTER_AUTH_SECRET: SECRET,
        GOOGLE_CLIENT_ID: "id",
        GOOGLE_CLIENT_SECRET: "secret",
      }),
    );

    expect(config.googleEnabled).toBe(true);
    expect(config.demoMode).toBe(false);
    expect(config.useSecureCookies).toBe(true);
  });

  it("refuses to start without Google credentials", () => {
    // The default path must never silently come up with sign-in broken.
    expect(() => readConfig(env({ BETTER_AUTH_SECRET: SECRET }))).toThrow(
      /GOOGLE_CLIENT_ID/,
    );
  });

  it("always requires a strong auth secret, demo mode included", () => {
    expect(() =>
      readConfig(env({ BETTER_AUTH_SECRET: "short", DEMO_MODE: "true" })),
    ).toThrow(/BETTER_AUTH_SECRET/);

    expect(() => readConfig(env({ DEMO_MODE: "true" }))).toThrow(
      /BETTER_AUTH_SECRET/,
    );
  });

  it("is off unless DEMO_MODE is exactly 'true'", () => {
    // Anything truthy-looking but not the literal string must not enable an
    // authentication bypass.
    for (const value of ["1", "yes", "TRUE", "True", "", undefined]) {
      const config = readConfig(
        env({
          BETTER_AUTH_SECRET: SECRET,
          GOOGLE_CLIENT_ID: "id",
          GOOGLE_CLIENT_SECRET: "secret",
          ...(value === undefined ? {} : { DEMO_MODE: value }),
        }),
      );
      expect(config.demoMode, `DEMO_MODE=${String(value)}`).toBe(false);
    }
  });

  it("allows missing Google credentials only in demo mode, and says so", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    const config = readConfig(
      env({ BETTER_AUTH_SECRET: SECRET, DEMO_MODE: "true" }),
    );

    expect(config.demoMode).toBe(true);
    expect(config.googleEnabled).toBe(false);
    // A running demo must be impossible to mistake for a real deployment.
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining("DEMO MODE IS ON"),
    );

    warn.mockRestore();
  });

  it("marks cookies Secure only on an https origin", () => {
    const base = {
      BETTER_AUTH_SECRET: SECRET,
      GOOGLE_CLIENT_ID: "id",
      GOOGLE_CLIENT_SECRET: "secret",
    };

    expect(
      readConfig(env({ ...base, APP_URL: "http://localhost:5173" }))
        .useSecureCookies,
    ).toBe(false);
    expect(
      readConfig(env({ ...base, APP_URL: "https://spotter.example" }))
        .useSecureCookies,
    ).toBe(true);
  });

  it("rejects a malformed APP_URL", () => {
    const base = {
      BETTER_AUTH_SECRET: SECRET,
      GOOGLE_CLIENT_ID: "id",
      GOOGLE_CLIENT_SECRET: "secret",
    };

    expect(() => readConfig(env({ ...base, APP_URL: "not-a-url" }))).toThrow();
    // A trailing slash would produce "https://host//api/auth/..." callbacks and
    // break the Origin comparison.
    expect(() =>
      readConfig(env({ ...base, APP_URL: "https://spotter.example/" })),
    ).toThrow();
  });
});
