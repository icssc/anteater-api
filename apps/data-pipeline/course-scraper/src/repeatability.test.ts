import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseRepeatability } from "./repeatability.js";

describe("parseRepeatability", () => {
  it("parses the catalogue's standard repeatability forms", () => {
    assert.deepEqual(parseRepeatability("May be taken for credit 3 times"), {
      repeatabilityTimes: 3,
      unit: "times",
    });
    assert.deepEqual(parseRepeatability("May be taken for credit for 12 units"), {
      repeatabilityTimes: 12,
      unit: "credit_hours",
    });
    assert.deepEqual(parseRepeatability("May be repeated an unlimited number of times"), {
      repeatabilityTimes: null,
      unit: null,
    });
  });

  it("accepts the current EURO ST 201 numberless source wording", () => {
    assert.deepEqual(parseRepeatability("May be taken for credit for unit as topics vary"), {
      repeatabilityTimes: null,
      unit: null,
    });
  });

  it("continues to reject genuinely unrecognized source content", () => {
    assert.throws(
      () => parseRepeatability("May be taken whenever the instructor permits"),
      /Unrecognized repeatability text/,
    );
  });
});
