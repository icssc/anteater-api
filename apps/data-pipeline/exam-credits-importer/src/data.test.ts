import assert from "node:assert/strict";
import { test } from "node:test";

import { apExamDataSchema, ibExamDataSchema } from "./schema.ts";

function reward(scores: number[], units = 8, electiveUnits = 8) {
  return {
    acceptableScores: scores,
    unitsGranted: units,
    electiveUnitsGranted: electiveUnits,
    geGranted: {},
    coursesGranted: { AND: [] },
  };
}

test("Rejects overlapping qualifying scores", () => {
  const data = {
    "IB Test": {
      rewards: [reward([5, 6]), reward([6, 7])],
    },
  };

  assert.equal(ibExamDataSchema.safeParse(data).success, false);
});

test("Rejects elective units greater than total units", () => {
  const data = {
    "IB Test": {
      rewards: [reward([5], 4, 8)],
    },
  };

  assert.equal(ibExamDataSchema.safeParse(data).success, false);
});

test("AP exams can have no rewards", () => {
  const data = {
    "AP Test": {
      rewards: [],
    },
  };

  assert.equal(apExamDataSchema.safeParse(data).success, true);
});
