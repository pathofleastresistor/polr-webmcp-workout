import { createHash } from "node:crypto";

import { eq } from "drizzle-orm";

import type { Database } from "~/db";
import { user, userProfile, type UserProfile } from "~/db/schema";

import { newId } from "./ids";

/**
 * 16 random bytes, base64url: 22 characters, 128 bits. Enough that guessing a
 * link is not a thing anyone can do, short enough to paste.
 */
const KEY_BYTES = 16;
export const KEY_PATTERN = /^[A-Za-z0-9_-]{22}$/;

export function hashKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

function generateKey(): string {
  const bytes = new Uint8Array(KEY_BYTES);
  crypto.getRandomValues(bytes);
  return Buffer.from(bytes).toString("base64url");
}

/**
 * Creates a person and returns the key for their private link.
 *
 * The key is returned exactly once, here. Only its hash is stored, so if the
 * person loses the link there is no way to recover it.
 */
export async function createUser(db: Database): Promise<{
  id: string;
  key: string;
}> {
  const id = newId();
  const key = generateKey();

  db.transaction((tx) => {
    tx.insert(user)
      .values({ id, keyHash: hashKey(key) })
      .run();
    tx.insert(userProfile).values({ userId: id }).run();
  });

  return { id, key };
}

/** Resolves a link key to its owner, or null for anything unknown. */
export async function findUserByKey(
  db: Database,
  key: string,
): Promise<{ id: string; profile: UserProfile } | null> {
  if (!KEY_PATTERN.test(key)) return null;

  const [row] = await db
    .select({ id: user.id, profile: userProfile })
    .from(user)
    .innerJoin(userProfile, eq(userProfile.userId, user.id))
    .where(eq(user.keyHash, hashKey(key)))
    .limit(1);

  return row ?? null;
}
