import { drizzle } from "drizzle-orm/d1";

import { schema } from "./schema";

export type Database = ReturnType<typeof createDatabase>;

/**
 * Builds a request-scoped Drizzle client over the D1 binding. Workers isolates
 * are reused across requests, but the binding itself is per-request, so this is
 * called once per request from the Worker entry rather than cached in a module.
 */
export function createDatabase(d1: D1Database) {
  return drizzle(d1, { schema, casing: "snake_case" });
}

export * from "./schema";
