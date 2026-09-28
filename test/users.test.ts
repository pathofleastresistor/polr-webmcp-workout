import { beforeEach, describe, expect, it } from "vitest";

import type { Database } from "~/db";
import { keyFromRequest } from "~/server/access.server";
import {
  KEY_PATTERN,
  createUser,
  findUserByKey,
  hashKey,
} from "~/server/services/users.server";

import { testDb } from "./helpers";

describe("private links", () => {
  let db: Database;

  beforeEach(() => {
    db = testDb();
  });

  it("creates a person whose link resolves back to them, with a profile", async () => {
    const { id, key } = await createUser(db);

    expect(key).toMatch(KEY_PATTERN);

    const found = await findUserByKey(db, key);
    expect(found?.id).toBe(id);
    expect(found?.profile.unitSystem).toBe("metric");
  });

  it("stores only a hash of the key", async () => {
    const { id, key } = await createUser(db);

    const row = await db.query.user.findFirst({
      where: (user, { eq }) => eq(user.id, id),
    });

    expect(row?.keyHash).toBe(hashKey(key));
    expect(JSON.stringify(row)).not.toContain(key);
  });

  it("gives every person a different link", async () => {
    const a = await createUser(db);
    const b = await createUser(db);

    expect(a.key).not.toBe(b.key);
    expect((await findUserByKey(db, b.key))?.id).toBe(b.id);
  });

  it("resolves nothing for an unknown or malformed key", async () => {
    await createUser(db);

    expect(await findUserByKey(db, "A".repeat(22))).toBeNull();
    expect(await findUserByKey(db, "short")).toBeNull();
    expect(await findUserByKey(db, "")).toBeNull();
  });
});

describe("keyFromRequest", () => {
  const key = "abcdefghijklmnopqrstuv";
  const at = (path: string) =>
    keyFromRequest(new Request(`https://spotter.example${path}`));

  it("reads the key from pages, data fetches and API routes alike", () => {
    expect(at(`/w/${key}`)).toBe(key);
    expect(at(`/w/${key}.data`)).toBe(key);
    expect(at(`/w/${key}/workout/123`)).toBe(key);
    expect(at(`/w/${key}/api/workouts?limit=1`)).toBe(key);
  });

  it("finds no key outside a link", () => {
    expect(at("/")).toBeNull();
    expect(at("/api/workouts")).toBeNull();
    expect(at(`/x/w/${key}`)).toBeNull();
  });
});
