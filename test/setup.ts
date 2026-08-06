import type { D1Migration } from "@cloudflare/vitest-pool-workers";
import { applyD1Migrations, env } from "cloudflare:test";
import { beforeAll } from "vitest";

/**
 * Applies the real migrations to the test D1 instance before anything runs, so
 * tests exercise the same schema — indexes, constraints and all — that
 * production does. The migration list is injected as a binding by
 * vitest.config.ts, since this file runs inside workerd with no filesystem.
 *
 * Narrowed here rather than declared on `Cloudflare.Env`: the binding exists
 * only under test, and augmenting the global interface would advertise it to
 * application code as though production had it too.
 */
const testEnv = env as typeof env & { TEST_MIGRATIONS: D1Migration[] };

beforeAll(async () => {
  await applyD1Migrations(testEnv.DB, testEnv.TEST_MIGRATIONS);
});
