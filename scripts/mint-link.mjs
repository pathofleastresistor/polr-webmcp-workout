/**
 * Mints a new private link for an existing person.
 *
 * Accounts from before links existed (Google sign-in) have no key, so their
 * workouts are unreachable until one is minted here. It also replaces a lost
 * link: the old one stops working.
 *
 *   npm run link              # list people, newest activity first
 *   npm run link -- <userId>  # mint a link for one of them
 */
import { createHash, randomBytes } from "node:crypto";
import { resolve } from "node:path";

import SQLite from "better-sqlite3";

const databasePath = resolve(process.env.DATABASE_PATH ?? "./data/spotter.db");
const appUrl = process.env.APP_URL ?? "http://localhost:5173";
const userId = process.argv[2];

const sqlite = new SQLite(databasePath, { fileMustExist: true });

if (!userId) {
  const rows = sqlite
    .prepare(
      `SELECT u.id, u.key_hash IS NOT NULL AS has_link,
              COUNT(w.id) AS workouts, MAX(w.started_at) AS last
         FROM user u LEFT JOIN workout w ON w.user_id = u.id
        GROUP BY u.id ORDER BY last DESC`,
    )
    .all();

  for (const row of rows) {
    const last = row.last ? new Date(row.last).toISOString().slice(0, 10) : "-";
    console.log(
      `${row.id}  ${String(row.workouts).padStart(4)} workouts  last ${last}  ${row.has_link ? "has link" : "NO LINK"}`,
    );
  }
  console.log("\nnpm run link -- <userId> to mint a link.");
  process.exit(0);
}

// Same shape as app/server/services/users.server.ts.
const key = randomBytes(16).toString("base64url");
const keyHash = createHash("sha256").update(key).digest("hex");

const result = sqlite
  .prepare("UPDATE user SET key_hash = ?, updated_at = ? WHERE id = ?")
  .run(keyHash, Date.now(), userId);

if (result.changes === 0) {
  console.error(`No user with id ${userId}.`);
  process.exit(1);
}

console.log(`${appUrl}/w/${key}`);
