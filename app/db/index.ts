import SQLite from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";

import { schema } from "./schema";

export type Database = ReturnType<typeof createDatabase>;

/**
 * Opens a SQLite database and wraps it in Drizzle.
 *
 * The pragmas are not optional decoration:
 *
 *  - `foreign_keys` is OFF by default in SQLite, and the schema leans on
 *    cascading deletes to remove a workout's exercises and sets. Without this
 *    those rows are orphaned rather than deleted.
 *  - `journal_mode = WAL` lets reads proceed while a write is in flight. The
 *    agent and the person drive the same session concurrently, so reads
 *    overlapping a write is the normal case here, not an edge one.
 *  - `busy_timeout` makes a contended write wait rather than fail immediately
 *    with SQLITE_BUSY.
 */
export function createDatabase(filename: string) {
  const sqlite = new SQLite(filename);

  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  sqlite.pragma("busy_timeout = 5000");

  return drizzle(sqlite, { schema, casing: "snake_case" });
}

/**
 * The process-wide connection.
 *
 * Under Workers the D1 binding was per-request, so the client was built once
 * per request. A SQLite handle is the opposite: opening one per request would
 * mean a file open, WAL negotiation and pragma round-trip on every hit. It is
 * opened once and shared, which is also what lets WAL do its job.
 */
let shared: Database | null = null;

export function getDatabase(filename: string): Database {
  shared ??= createDatabase(filename);
  return shared;
}

export * from "./schema";
