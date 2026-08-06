import { beforeEach, describe, expect, it } from "vitest";

import type { Database } from "~/db";
import {
  createExercise,
  searchExercises,
  slugify,
} from "~/server/services/exercises.server";

import { createUser, testDb } from "./helpers";

const BULGARIAN = {
  name: "Bulgarian Split Squat",
  primaryMuscle: "quads" as const,
  secondaryMuscles: ["glutes" as const],
  equipment: "dumbbell",
  modality: "strength" as const,
  isUnilateral: true,
};

describe("createExercise", () => {
  let db: Database;
  let userId: string;

  beforeEach(async () => {
    db = testDb();
    userId = (await createUser(db)).id;
  });

  it("creates a movement the person has never trained", async () => {
    const result = await createExercise(db, userId, BULGARIAN);

    expect(result.created).toBe(true);
    expect(result.exercise.name).toBe("Bulgarian Split Squat");
    expect(result.exercise.primaryMuscle).toBe("quads");
    expect(result.exercise.isCustom).toBe(true);
  });

  it("returns the existing exercise instead of a second copy", async () => {
    const first = await createExercise(db, userId, BULGARIAN);
    const second = await createExercise(db, userId, BULGARIAN);

    expect(second.created).toBe(false);
    expect(second.exercise.id).toBe(first.exercise.id);
  });

  it("treats spelling variations of one movement as the same exercise", async () => {
    // Volume, staleness and 1RMs are keyed on the exercise row, so two rows
    // for one lift would split its history and skew every insight drawn from
    // it — silently, which is the dangerous part.
    const first = await createExercise(db, userId, BULGARIAN);

    for (const name of [
      "bulgarian split squat",
      "Bulgarian  Split  Squat",
      "Bulgarian Split-Squat",
      "  BULGARIAN SPLIT SQUAT  ",
    ]) {
      const again = await createExercise(db, userId, { ...BULGARIAN, name });
      expect(again.created).toBe(false);
      expect(again.exercise.id).toBe(first.exercise.id);
    }
  });

  it("does not let a later call rewrite an existing exercise's attribution", async () => {
    // History is already recorded against the original attribution; silently
    // changing it would move volume between muscle groups after the fact.
    const first = await createExercise(db, userId, BULGARIAN);
    const again = await createExercise(db, userId, {
      ...BULGARIAN,
      primaryMuscle: "chest",
    });

    expect(again.exercise.primaryMuscle).toBe("quads");
    expect(again.exercise.id).toBe(first.exercise.id);
  });

  it("keeps one person's library out of another's", async () => {
    const other = (await createUser(db)).id;
    await createExercise(db, userId, BULGARIAN);

    const theirs = await createExercise(db, other, BULGARIAN);
    expect(theirs.created).toBe(true);

    const visible = await searchExercises(db, other, { limit: 20 });
    expect(visible).toHaveLength(1);
    expect(visible[0]!.id).toBe(theirs.exercise.id);
  });

  it("drops a secondary muscle that repeats the primary", async () => {
    // Otherwise insights would count the same group twice for one set.
    const result = await createExercise(db, userId, {
      ...BULGARIAN,
      secondaryMuscles: ["quads", "glutes", "glutes"],
    });

    expect(result.exercise.secondaryMuscles).toEqual(["glutes"]);
  });

  it("refuses a name with nothing to identify it by", async () => {
    await expect(
      createExercise(db, userId, { ...BULGARIAN, name: "!!!" }),
    ).rejects.toThrow();
  });

  it("is findable by search straight after creation", async () => {
    const created = await createExercise(db, userId, BULGARIAN);
    const found = await searchExercises(db, userId, {
      query: "split",
      limit: 20,
    });

    expect(found.map((item) => item.id)).toContain(created.exercise.id);
  });
});

describe("slugify", () => {
  it("folds case, punctuation and spacing to one identity", () => {
    expect(slugify("Bulgarian Split Squat")).toBe("bulgarian-split-squat");
    expect(slugify("bulgarian  split-squat")).toBe("bulgarian-split-squat");
    expect(slugify("  Bulgarian Split Squat!  ")).toBe("bulgarian-split-squat");
  });

  it("folds accents, so one movement is not two exercises", () => {
    expect(slugify("Cúrl")).toBe(slugify("Curl"));
  });

  it("keeps genuinely different movements apart", () => {
    expect(slugify("Front Squat")).not.toBe(slugify("Back Squat"));
  });

  it("returns nothing for a name with no letters or digits", () => {
    expect(slugify("!!!")).toBe("");
  });
});
