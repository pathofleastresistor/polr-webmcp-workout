import path from "node:path";

import {
  cloudflareTest,
  readD1Migrations,
} from "@cloudflare/vitest-pool-workers";
import { defineConfig } from "vitest/config";

/**
 * Tests run inside workerd against a real (local) D1 database rather than a
 * mock. The domain layer's correctness lives partly in its SQL — unique
 * indexes, cascades, batch atomicity — and a mocked database would verify none
 * of it.
 *
 * Migrations are read here, in Node, and handed to the worker as a binding:
 * the test setup file executes inside workerd, which has no real filesystem.
 */
const migrations = await readD1Migrations(
  path.join(import.meta.dirname, "drizzle/migrations"),
);

export default defineConfig({
  plugins: [
    cloudflareTest({
      // Reuses the real binding definitions so tests and production agree.
      wrangler: { configPath: "./wrangler.jsonc" },
      miniflare: {
        compatibilityFlags: ["nodejs_compat"],
        bindings: {
          TEST_MIGRATIONS: migrations,
          BETTER_AUTH_SECRET: "test-secret-at-least-32-characters-long!!",
          GOOGLE_CLIENT_ID: "test-client-id",
          GOOGLE_CLIENT_SECRET: "test-client-secret",
        },
      },
    }),
  ],
  resolve: {
    tsconfigPaths: true,
  },
  test: {
    include: ["test/**/*.test.ts"],
    setupFiles: ["./test/setup.ts"],
  },
});
