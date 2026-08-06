/**
 * Applies pending migrations.
 *
 * Idempotent, so this is safe to run on every start: the migrator skips what it
 * has already applied.
 *
 * There is no catalog to seed. Exercises are created by the person or their
 * agent as they train, scoped to that person, so a fresh database starts with
 * an empty library by design.
 */
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";

import SQLite from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";

const databasePath = resolve(process.env.DATABASE_PATH ?? "./data/spotter.db");

// The directory may not exist on a first run against a fresh volume.
mkdirSync(dirname(databasePath), { recursive: true });

const sqlite = new SQLite(databasePath);
sqlite.pragma("journal_mode = WAL");
sqlite.pragma("foreign_keys = ON");

const db = drizzle(sqlite);

console.log(`spotter: applying migrations to ${databasePath}`);
migrate(db, { migrationsFolder: "./drizzle/migrations" });

sqlite.close();
console.log("spotter: database ready");
