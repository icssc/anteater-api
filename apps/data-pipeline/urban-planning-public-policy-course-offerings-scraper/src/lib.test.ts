import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { load } from "cheerio";
import {
  normalizeUrbanPlanningPublicPolicyCourseId,
  parseUrbanPlanningPublicPolicyAcademicYear,
  parseUrbanPlanningPublicPolicyCourseOfferings,
  parseUrbanPlanningPublicPolicyDisplayedUpdate,
} from "./lib.ts";

const fixture = await readFile(
  join(dirname(fileURLToPath(import.meta.url)), "../test/fixtures/courses.html"),
  "utf8",
);

test("normalizes UPPP numeric course IDs", () => {
  assert.equal(normalizeUrbanPlanningPublicPolicyCourseId("UPPP 4"), "UPPP4");
  assert.equal(normalizeUrbanPlanningPublicPolicyCourseId("UPPP 100"), "UPPP100");
  assert.equal(normalizeUrbanPlanningPublicPolicyCourseId("UPPP 100 – Special Topics"), null);
});

test("extracts academic year, month update, and Fall/Winter/Spring terms", () => {
  assert.deepEqual(parseUrbanPlanningPublicPolicyAcademicYear(fixture), {
    academicYear: "2026-2027",
    startYear: 2026,
  });
  assert.equal(parseUrbanPlanningPublicPolicyDisplayedUpdate(fixture), "April 2026");
  assert.deepEqual(
    parseUrbanPlanningPublicPolicyCourseOfferings(fixture).terms.map(
      (term) => `${term.year} ${term.quarter}`,
    ),
    ["2026 Fall", "2027 Winter", "2027 Spring"],
  );
});

test("parses multiple entries, strips Special Topics annotations, and stores empty instructors", () => {
  const parsed = parseUrbanPlanningPublicPolicyCourseOfferings(fixture);
  assert.deepEqual(parsed.sourceEntriesByQuarter, { Fall: 5, Winter: 5, Spring: 6 });
  assert.deepEqual(parsed.offeringsByQuarter, { Fall: 5, Winter: 5, Spring: 6 });
  assert.equal(parsed.uniqueOfferings, 16);
  assert.equal(parsed.uniqueCourseIds, 13);
  assert.equal(parsed.courseIds.includes("UPPP100"), true);
  assert.ok(parsed.offerings.every((offering) => offering.instructors.length === 0));
  assert.equal(parsed.lastUpdated, null);
  assert.deepEqual(parsed.parsingErrors, []);
});

test("preserves same courses across terms and collapses duplicates", () => {
  const $ = load(fixture);
  $("table.schedule tbody td").first().append("<span>UPPP 4</span>");
  const parsed = parseUrbanPlanningPublicPolicyCourseOfferings($.html());
  assert.equal(parsed.duplicateEntriesCollapsed, 1);
  assert.deepEqual(
    parsed.offerings
      .filter((offering) => offering.courseId === "UPPP4")
      .map((offering) => offering.quarter),
    ["Fall", "Winter", "Spring"],
  );
});

test("reports malformed nonempty fragments, blank quarters, and missing columns", () => {
  const malformed = load(fixture);
  malformed("table.schedule tbody td").first().append("<span>UPPP ???</span>");
  assert.ok(
    parseUrbanPlanningPublicPolicyCourseOfferings(malformed.html()).parsingErrors.some((error) =>
      error.includes("unrecognized nonempty schedule fragment"),
    ),
  );
  const empty = load(fixture);
  empty("table.schedule tbody tr td:nth-child(1)").html(" ");
  assert.ok(
    parseUrbanPlanningPublicPolicyCourseOfferings(empty.html()).parsingErrors.some((error) =>
      error.includes("empty Fall"),
    ),
  );
  const missingColumn = load(fixture);
  missingColumn("table.schedule thead th").last().remove();
  assert.ok(
    parseUrbanPlanningPublicPolicyCourseOfferings(missingColumn.html()).parsingErrors.some(
      (error) => error.includes("Spring quarter column"),
    ),
  );
  const missingHeading = load(fixture);
  missingHeading("h1, h2").remove();
  assert.ok(
    parseUrbanPlanningPublicPolicyCourseOfferings(missingHeading.html()).parsingErrors.some(
      (error) => error.includes("schedule heading"),
    ),
  );
  const missingTable = load(fixture);
  missingTable("table.schedule").remove();
  assert.ok(
    parseUrbanPlanningPublicPolicyCourseOfferings(missingTable.html()).parsingErrors.some((error) =>
      error.includes("qualifying schedule table"),
    ),
  );
});
