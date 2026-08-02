import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { load } from "cheerio";
import {
  normalizePsychologyCourseId,
  parsePsychologyAcademicYear,
  parsePsychologyCourseOfferings,
  parsePsychologyDisplayedUpdate,
} from "./lib.ts";

const fixture = await readFile(
  join(dirname(fileURLToPath(import.meta.url)), "../test/fixtures/courses.html"),
  "utf8",
);

test("uses current PSY canonical IDs and does not create PSCI offerings", () => {
  assert.equal(normalizePsychologyCourseId("PSY 21"), "PSY21");
  assert.equal(normalizePsychologyCourseId("PSY 101D"), "PSY101D");
  assert.equal(normalizePsychologyCourseId("PSY 104S"), "PSY104S");
  assert.equal(normalizePsychologyCourseId("PSCI 101D"), null);
});

test("extracts academic year, displayed month, and canonical terms", () => {
  assert.deepEqual(parsePsychologyAcademicYear(fixture), {
    academicYear: "2026-2027",
    startYear: 2026,
  });
  assert.equal(parsePsychologyDisplayedUpdate(fixture), "April 2026");
  assert.deepEqual(
    parsePsychologyCourseOfferings(fixture).terms.map((term) => `${term.year} ${term.quarter}`),
    ["2026 Fall", "2027 Winter", "2027 Spring"],
  );
});

test("parses numeric and suffix-letter courses, special-topics annotations, and Unicode whitespace", () => {
  const parsed = parsePsychologyCourseOfferings(fixture);
  assert.deepEqual(parsed.sourceEntriesByQuarter, { Fall: 5, Winter: 5, Spring: 4 });
  assert.deepEqual(parsed.offeringsByQuarter, { Fall: 5, Winter: 5, Spring: 4 });
  assert.equal(parsed.uniqueOfferings, 14);
  assert.equal(parsed.courseIds.includes("PSY100"), true);
  assert.equal(parsed.courseIds.includes("PSY104S"), true);
  assert.equal(
    parsed.courseIds.some((id) => id.startsWith("PSCI")),
    false,
  );
  assert.equal(parsed.lastUpdated, null);
  assert.ok(parsed.offerings.every((offering) => offering.instructors.length === 0));
  assert.deepEqual(parsed.parsingErrors, []);
});

test("keeps repeated courses separate by term and collapses duplicate course-term entries", () => {
  const $ = load(fixture);
  $("table.schedule tbody td").first().append(" PSY 21");
  const parsed = parsePsychologyCourseOfferings($.html());
  assert.equal(parsed.duplicateEntriesCollapsed, 1);
  assert.deepEqual(
    parsed.offerings
      .filter((offering) => offering.courseId === "PSY21")
      .map((offering) => offering.quarter),
    ["Fall", "Winter", "Spring"],
  );
});

test("ignores outside content and reports malformed fragments or incomplete tables", () => {
  const malformed = load(fixture);
  malformed("table.schedule tbody td").first().append("<p>PSY ???</p>");
  assert.ok(
    parsePsychologyCourseOfferings(malformed.html()).parsingErrors.some((error) =>
      error.includes("unrecognized nonempty schedule fragment"),
    ),
  );
  const missing = load(fixture);
  missing("h1, h2").remove();
  assert.ok(
    parsePsychologyCourseOfferings(missing.html()).parsingErrors.some((error) =>
      error.includes("schedule heading"),
    ),
  );
  const missingTable = load(fixture);
  missingTable("table.schedule").remove();
  assert.ok(
    parsePsychologyCourseOfferings(missingTable.html()).parsingErrors.some((error) =>
      error.includes("qualifying schedule table"),
    ),
  );
  const missingColumn = load(fixture);
  missingColumn("table.schedule thead th").first().remove();
  assert.ok(
    parsePsychologyCourseOfferings(missingColumn.html()).parsingErrors.some((error) =>
      error.includes("Fall quarter column"),
    ),
  );
  const emptyQuarter = load(fixture);
  emptyQuarter("table.schedule tbody tr td:nth-child(1)").html(" ");
  assert.ok(
    parsePsychologyCourseOfferings(emptyQuarter.html()).parsingErrors.some((error) =>
      error.includes("empty Fall"),
    ),
  );
  const outside = parsePsychologyCourseOfferings(fixture);
  assert.equal(outside.courseIds.includes("PSCI196"), false);
});
