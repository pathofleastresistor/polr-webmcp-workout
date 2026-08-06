import { defineConfig } from "vitest/config";

/**
 * Tests run in Node against a real SQLite database rather than a mock. The
 * domain layer's correctness lives partly in its SQL — unique indexes,
 * cascades, batch atomicity — and a mocked database would verify none of it.
 *
 * Each test file gets its own in-memory database (see test/setup.ts), so they
 * neither share state nor touch the developer's working database.
 */
export default defineConfig({
  resolve: {
    tsconfigPaths: true,
  },
  test: {
    include: ["test/**/*.test.ts"],
    setupFiles: ["./test/setup.ts"],
    environment: "node",
  },
});
