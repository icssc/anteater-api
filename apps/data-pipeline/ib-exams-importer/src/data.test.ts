import assert from "node:assert/strict";
import { test } from "node:test";

import ibExamData from "./data.ts";
import { ibExamDataSchema } from "./schema.ts";

test("IB exams have valid credit mappings", () => {
  assert.doesNotThrow(() => ibExamDataSchema.parse(ibExamData));
});

test("Rejects empty IB exam data", () => {
  assert.equal(ibExamDataSchema.safeParse({}).success, false);
});

test("Rejects duplicate qualifying scores", () => {
  const invalidData = {
    "IB Test (HL)": {
      rewards: [
        {
          acceptableScores: [5, 5],
          unitsGranted: 8,
          electiveUnitsGranted: 8,
          geGranted: {},
          coursesGranted: { AND: [] },
        },
      ],
    },
  };

  assert.equal(ibExamDataSchema.safeParse(invalidData).success, false);
});

test("Rejects invalid credit units", () => {
  const invalidData = {
    "IB Test (HL)": {
      rewards: [
        {
          acceptableScores: [5],
          unitsGranted: 4,
          electiveUnitsGranted: 8,
          geGranted: {},
          coursesGranted: { AND: [] },
        },
      ],
    },
  };

  assert.equal(ibExamDataSchema.safeParse(invalidData).success, false);
});
