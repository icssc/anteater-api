import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { load } from "cheerio";
import {
  normalizeCriminologyLawSocietyCourseId,
  parseCriminologyLawSocietyAcademicYear,
  parseCriminologyLawSocietyCourseOfferings,
  parseCriminologyLawSocietyDisplayedUpdate,
} from "./lib.ts";

const fixture = await readFile(
  join(dirname(fileURLToPath(import.meta.url)), "../test/fixtures/courses.html"),
  "utf8",
);

test("normalizes CRM/LAW slash department and preserves C-prefixed numbers", () => {
  assert.equal(normalizeCriminologyLawSocietyCourseId("CRM/LAW C7"), "CRM/LAWC7");
  assert.equal(normalizeCriminologyLawSocietyCourseId("crm / law C10"), "CRM/LAWC10");
  assert.equal(normalizeCriminologyLawSocietyCourseId("CRM/LAW C174"), "CRM/LAWC174");
  assert.equal(normalizeCriminologyLawSocietyCourseId("CRM/LAW 7"), null);
});

test("extracts the 2026-2027 schedule, month update, and all three terms", () => {
  assert.deepEqual(parseCriminologyLawSocietyAcademicYear(fixture), {
    academicYear: "2026-2027",
    startYear: 2026,
  });
  assert.equal(parseCriminologyLawSocietyDisplayedUpdate(fixture), "April 2026");
  assert.deepEqual(
    parseCriminologyLawSocietyCourseOfferings(fixture).terms.map(
      (term) => `${term.year} ${term.quarter}`,
    ),
    ["2026 Fall", "2027 Winter", "2027 Spring"],
  );
});

test("parses multiple entries per cell, adjacent labels, annotations, and empty instructors", () => {
  const parsed = parseCriminologyLawSocietyCourseOfferings(fixture);
  assert.deepEqual(parsed.sourceEntriesByQuarter, { Fall: 6, Winter: 4, Spring: 4 });
  assert.deepEqual(parsed.offeringsByQuarter, { Fall: 6, Winter: 4, Spring: 4 });
  assert.equal(parsed.uniqueOfferings, 14);
  assert.equal(parsed.uniqueCourseIds, 8);
  assert.equal(parsed.lastUpdated, null);
  assert.ok(parsed.offerings.every((offering) => offering.instructors.length === 0));
  assert.equal(parsed.courseIds.includes("CRM/LAWC100"), true);
  assert.equal(parsed.courseIds.includes("CRM/LAWC114"), true);
  assert.equal(parsed.parsingErrors.length, 0);
});

test("collapses duplicate course-term entries and reports malformed fragments", () => {
  const $ = load(fixture);
  $("table.schedule tbody td").first().append('<div class="course">CRM/LAW C7</div>');
  $("table.schedule tbody td").first().append('<div class="course">CRM/LAW ???</div>');
  const parsed = parseCriminologyLawSocietyCourseOfferings($.html());
  assert.equal(parsed.duplicateEntriesCollapsed, 1);
  assert.ok(
    parsed.parsingErrors.some((error) => error.includes("unrecognized nonempty schedule fragment")),
  );
});

test("reports missing headings, tables, columns, and empty quarters", () => {
  const missingHeading = load(fixture);
  missingHeading("h1, h2").remove();
  assert.ok(
    parseCriminologyLawSocietyCourseOfferings(missingHeading.html()).parsingErrors.some((error) =>
      error.includes("schedule heading"),
    ),
  );
  const missingTable = load(fixture);
  missingTable("table.schedule").remove();
  assert.ok(
    parseCriminologyLawSocietyCourseOfferings(missingTable.html()).parsingErrors.some((error) =>
      error.includes("qualifying schedule table"),
    ),
  );
  const missingColumn = load(fixture);
  missingColumn("table.schedule thead th").first().remove();
  assert.ok(
    parseCriminologyLawSocietyCourseOfferings(missingColumn.html()).parsingErrors.some((error) =>
      error.includes("Fall quarter column"),
    ),
  );
  const emptyQuarter = load(fixture);
  emptyQuarter("table.schedule tbody tr td:nth-child(1)").html("&nbsp;");
  assert.ok(
    parseCriminologyLawSocietyCourseOfferings(emptyQuarter.html()).parsingErrors.some((error) =>
      error.includes("empty Fall"),
    ),
  );
});
