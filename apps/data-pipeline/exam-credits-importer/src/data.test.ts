import assert from "node:assert/strict";
import { test } from "node:test";

import apExamData from "./ap-data.ts";
import ibExamData from "./ib-data.ts";
import { apExamDataSchema, ibExamDataSchema } from "./schema.ts";

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

test("AP exams have valid credit mappings", () => {
  const data = apExamDataSchema.parse(apExamData);
  assert.equal(Object.keys(data).length, 39);
});

test("AP exams may have no rewards", () => {
  const data = apExamDataSchema.parse(apExamData);
  assert.deepEqual(data["AP Computer Science AB"].rewards, []);
});

test("Rejects AP scores outside the valid range", () => {
  const invalidData = {
    "AP Test": {
      rewards: [
        {
          acceptableScores: [6],
          unitsGranted: 4,
          electiveUnitsGranted: 4,
          geGranted: {},
          coursesGranted: { AND: [] },
        },
      ],
    },
  };

  assert.equal(apExamDataSchema.safeParse(invalidData).success, false);
});

test("Rejects invalid IB scores", () => {
  const invalidData = {
    "IB Test (HL)": {
      rewards: [
        {
          acceptableScores: [4],
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
