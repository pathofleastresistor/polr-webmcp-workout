import { beforeAll } from "vitest";

/**
 * Configuration the app reads at import time.
 *
 * Set before anything else so `readConfig` sees a complete environment: the
 * database is in memory and private to this worker, so a test can never write
 * to a real one by forgetting to point it somewhere.
 */
beforeAll(() => {
  process.env.APP_URL ??= "https://spotter.example";
  process.env.BETTER_AUTH_SECRET ??=
    "test-secret-at-least-32-characters-long!!";
  process.env.GOOGLE_CLIENT_ID ??= "test-client-id";
  process.env.GOOGLE_CLIENT_SECRET ??= "test-client-secret";
  process.env.DATABASE_PATH ??= ":memory:";
});
