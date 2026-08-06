import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";

import type { Database } from "~/db";
import { user, userProfile } from "~/db/schema";
import { seedDemoData } from "~/server/services/demo.server";
import { getInsights } from "~/server/services/insights.server";
import { listWorkouts } from "~/server/services/workouts.server";

import { testDb } from "./helpers";

/** A user with no profile row — the state the demo route runs against. */
async function createBareUser(db: Database): Promise<string> {
  const id = `demo-user-${crypto.randomUUID().slice(0, 8)}`;
  await db.insert(user).values({
    id,
    name: "Demo Athlete",
    email: `${id}@example.com`,
    emailVerified: false,
  });
  return id;
}

describe("seedDemoData", () => {
  let db: Database;

  beforeEach(async () => {
    db = testDb();
  });

  it("marks the account as demo even though no profile row exists yet", async () => {
    const userId = await createBareUser(db);

    // Regression: this used to be an UPDATE, which matched zero rows because
    // the profile is created lazily on first authenticated request. `isDemo`
    // silently stayed false, and session revocation depends on it being true.
    await seedDemoData(db, userId);

    const profile = await db.query.userProfile.findFirst({
      where: eq(userProfile.userId, userId),
    });

    expect(profile).toBeDefined();
    expect(profile?.isDemo).toBe(true);
    expect(profile?.experienceLevel).toBe("intermediate");
    expect(profile?.goal).toContain("bench");
  });

  it("is idempotent against an existing profile row", async () => {
    const userId = await createBareUser(db);
    await db.insert(userProfile).values({ userId });

    await seedDemoData(db, userId);

    const profile = await db.query.userProfile.findFirst({
      where: eq(userProfile.userId, userId),
    });
    expect(profile?.isDemo).toBe(true);
  });

  it("produces history rich enough for the insights page to be worth reading", async () => {
    const userId = await createBareUser(db);
    await seedDemoData(db, userId);

    const profile = await db.query.userProfile.findFirst({
      where: eq(userProfile.userId, userId),
    });

    const workouts = await listWorkouts(db, userId, {
      limit: 50,
      status: "completed",
    });
    expect(workouts.length).toBeGreaterThanOrEqual(20);
    // Some sessions attributed to the agent, so the UI's agent-planned badge
    // and the actor column are both exercised by the demo.
    expect(workouts.some((w) => w.plannedBy === "agent")).toBe(true);
    expect(workouts.every((w) => w.completedSets > 0)).toBe(true);

    const insights = await getInsights(db, userId, profile!, { weeks: 8 });
    expect(insights.totalVolumeKg).toBeGreaterThan(50_000);
    expect(insights.currentStreakWeeks).toBeGreaterThanOrEqual(4);
    expect(insights.personalRecords.length).toBeGreaterThan(3);
    // The whole point of the demo data: visible imbalance for an agent to act on.
    expect(insights.underworkedMuscleGroups.length).toBe(3);
  });

  it("keeps demo accounts isolated from each other", async () => {
    const a = await createBareUser(db);
    const b = await createBareUser(db);

    await seedDemoData(db, a);

    expect(
      (await listWorkouts(db, b, { limit: 50, status: "any" })).length,
    ).toBe(0);
  });
});
