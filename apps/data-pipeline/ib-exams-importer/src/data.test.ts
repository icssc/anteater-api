import assert from "node:assert/strict";
import { test } from "node:test";

import ibExamData from "./data.ts";

test("IB exams have valid credit mappings", () => {
  assert.ok(Object.keys(ibExamData).length > 0, "No IB exams defined");

  for (const [examName, exam] of Object.entries(ibExamData)) {
    assert.ok(examName.trim().length > 0, "IB exam name cannot be blank");
    assert.ok(exam.rewards.length > 0);

    const seenScores = new Set<number>();

    for (const reward of exam.rewards) {
      assert.ok(reward.acceptableScores.length > 0);

      for (const score of reward.acceptableScores) {
        assert.ok(score >= 5 && score <= 7, `${examName}: invalid qualifying score ${score}`);

        assert.ok(!seenScores.has(score), `${examName}: duplicate score ${score}`);

        seenScores.add(score);
      }

      assert.ok(
        Number.isInteger(reward.unitsGranted) && reward.unitsGranted >= 0,
        `${examName}: invalid unitsGranted`,
      );

      assert.ok(
        Number.isInteger(reward.electiveUnitsGranted) && reward.electiveUnitsGranted >= 0,
        `${examName}: invalid electiveUnitsGranted`,
      );

      assert.ok(
        reward.electiveUnitsGranted <= reward.unitsGranted,
        `${examName}: elective units exceed total units`,
      );

      for (const value of Object.values(reward.geGranted)) {
        assert.ok(Number.isInteger(value) && value >= 0);
      }
    }
  }
});
