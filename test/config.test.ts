import { describe, expect, it } from "vitest";

import { DEFAULT_DATABASE_PATH, readConfig } from "~/server/env.server";

describe("readConfig", () => {
  it("needs nothing but APP_URL", () => {
    const config = readConfig({ APP_URL: "https://spotter.example" });

    expect(config.appUrl).toBe("https://spotter.example");
    expect(config.isHttps).toBe(true);
    expect(config.databasePath).toBe(DEFAULT_DATABASE_PATH);
  });

  it("refuses to start without APP_URL", () => {
    expect(() => readConfig({})).toThrow(/APP_URL/);
  });

  it("sends HSTS only on an https origin", () => {
    expect(readConfig({ APP_URL: "http://localhost:5173" }).isHttps).toBe(
      false,
    );
  });

  it("rejects a malformed APP_URL", () => {
    expect(() => readConfig({ APP_URL: "not-a-url" })).toThrow(/APP_URL/);
    // A trailing slash would break the Origin comparison.
    expect(() => readConfig({ APP_URL: "https://spotter.example/" })).toThrow(
      /trailing slash/,
    );
  });
});
