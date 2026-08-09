import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { load } from "cheerio";
import {
  normalizeEngineeringCourseId,
  parseEngineeringAcademicYear,
  parseEngineeringCourseOfferings,
  parseEngineeringInstructorNames,
  shouldCleanupEngineeringSource,
} from "./lib.ts";

const fixture = await readFile(
  join(dirname(fileURLToPath(import.meta.url)), "../test/fixtures/teaching-plan.html"),
  "utf8",
);

test("normalizes canonical Engineering department and course-number forms", () => {
  assert.equal(normalizeEngineeringCourseId("BME 112\n(formerly BME 60D)"), "BME112");
  assert.equal(normalizeEngineeringCourseId("EECS 10"), "EECS10");
  assert.equal(normalizeEngineeringCourseId("ENGRCEE 195W"), "ENGRCEE195W");
  assert.equal(normalizeEngineeringCourseId("MSE H190"), "MSEH190");
  assert.equal(normalizeEngineeringCourseId("Biomedical Engineering"), null);
});

test("strips structured summer-session markers without inventing instructors", () => {
  assert.deepEqual(parseEngineeringInstructorNames("SSI - Alireza Kavianpour"), [
    "Alireza Kavianpour",
  ]);
  assert.deepEqual(parseEngineeringInstructorNames("SSII (online)- Quoc Viet Dang"), [
    "Quoc Viet Dang",
  ]);
  assert.deepEqual(parseEngineeringInstructorNames("SS10WK (online)"), []);
  assert.deepEqual(parseEngineeringInstructorNames("SSI & SSII - STAFF"), []);
});

test("parses the explicit academic year and Fall/Winter/Spring columns", () => {
  assert.deepEqual(parseEngineeringAcademicYear(fixture), {
    academicYear: "2026-2027",
    startYear: 2026,
  });
  const parsed = parseEngineeringCourseOfferings(fixture);
  assert.deepEqual(
    parsed.terms.map(({ year, quarter }) => `${year} ${quarter}`),
    ["2026 Fall", "2027 Winter", "2027 Spring"],
  );
  assert.equal(parsed.summerCellsSuppressed, 43);
  assert.equal(parsed.lastUpdated, null);
});

test("emits only nonempty regular-quarter cells, deduplicates rows, and keeps cross-list notes out", () => {
  const parsed = parseEngineeringCourseOfferings(fixture);
  assert.equal(parsed.sourceRowsParsed, 627);
  assert.ok(
    parsed.offerings.some(({ courseId, quarter }) => courseId === "BME1" && quarter === "Fall"),
  );
  assert.equal(
    parsed.offerings.some(({ courseId }) => courseId === "BIOSCI183"),
    false,
  );
  assert.ok(parsed.duplicateRowsCollapsed > 0);
  assert.ok(parsed.courseIds.includes("EECS10"));
  assert.ok(parsed.offerings.every(({ instructors }) => Array.isArray(instructors)));
  const bme60cSpring = parsed.offerings.find(
    ({ courseId, quarter }) => courseId === "BME60C" && quarter === "Spring",
  );
  assert.ok(bme60cSpring?.instructors.includes("Christine E King"));
  assert.ok(bme60cSpring?.instructors.includes("Gurneet Sangha"));
});

test("does not emit canceled quarter cells or rows marked canceled", () => {
  const parsed = parseEngineeringCourseOfferings(fixture);
  const canceledFallCourseIds = ["BME160", "CBE264", "CBE271", "EECS285C", "MSE142", "MSE242"];

  for (const courseId of canceledFallCourseIds) {
    assert.equal(
      parsed.offerings.some(
        (offering) => offering.courseId === courseId && offering.quarter === "Fall",
      ),
      false,
      `${courseId} should not be emitted for its canceled Fall row`,
    );
  }
});

test("ignores section labels and reports required-column failures", () => {
  const $ = load(fixture);
  $("table tr").eq(2).children("td").eq(4).text("Winter");
  const parsed = parseEngineeringCourseOfferings($.html());
  assert.ok(parsed.parsingErrors.some((error) => error.includes("Winter")));
  assert.equal(shouldCleanupEngineeringSource(parsed), false);
});
