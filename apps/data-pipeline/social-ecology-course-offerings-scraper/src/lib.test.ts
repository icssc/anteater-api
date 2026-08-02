import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { load } from "cheerio";
import {
  normalizeSocialEcologyCourseId,
  parseSocialEcologyAcademicYear,
  parseSocialEcologyCourseOfferings,
  parseSocialEcologyDisplayedUpdate,
} from "./lib.ts";

const fixture = await readFile(
  join(dirname(fileURLToPath(import.meta.url)), "../test/fixtures/courses.html"),
  "utf8",
);

test("normalizes mixed-case SocEcol IDs and preserves H, W, and CW letters", () => {
  assert.equal(normalizeSocialEcologyCourseId("SocEcol 10"), "SOCECOL10");
  assert.equal(normalizeSocialEcologyCourseId("socecol H190A"), "SOCECOLH190A");
  assert.equal(normalizeSocialEcologyCourseId("SocEcol 195CW"), "SOCECOL195CW");
  assert.equal(normalizeSocialEcologyCourseId("SocEcol 195W"), "SOCECOL195W");
});

test("extracts the academic year, June update month, and canonical terms", () => {
  assert.deepEqual(parseSocialEcologyAcademicYear(fixture), {
    academicYear: "2026-2027",
    startYear: 2026,
  });
  assert.equal(parseSocialEcologyDisplayedUpdate(fixture), "June 2026");
  assert.deepEqual(
    parseSocialEcologyCourseOfferings(fixture).terms.map((term) => `${term.year} ${term.quarter}`),
    ["2026 Fall", "2027 Winter", "2027 Spring"],
  );
});

test("parses multiple courses per quarter and all requested letter forms", () => {
  const parsed = parseSocialEcologyCourseOfferings(fixture);
  assert.deepEqual(parsed.sourceEntriesByQuarter, { Fall: 7, Winter: 7, Spring: 8 });
  assert.equal(parsed.uniqueOfferings, 22);
  assert.equal(parsed.uniqueCourseIds, 13);
  for (const id of [
    "SOCECOLH190A",
    "SOCECOLH190B",
    "SOCECOLH190W",
    "SOCECOL195A",
    "SOCECOL195B",
    "SOCECOL195CW",
    "SOCECOL195W",
  ])
    assert.equal(parsed.courseIds.includes(id), true);
  assert.ok(parsed.offerings.every((offering) => offering.instructors.length === 0));
  assert.equal(parsed.lastUpdated, null);
  assert.deepEqual(parsed.parsingErrors, []);
});

test("keeps repeated courses separate by term and collapses a duplicate entry", () => {
  const $ = load(fixture);
  $("table.schedule tbody td").first().append("<span>SocEcol 10</span>");
  const parsed = parseSocialEcologyCourseOfferings($.html());
  assert.equal(parsed.duplicateEntriesCollapsed, 1);
  assert.deepEqual(
    parsed.offerings
      .filter((offering) => offering.courseId === "SOCECOL10")
      .map((offering) => offering.quarter),
    ["Fall", "Winter", "Spring"],
  );
});

test("reports malformed fragments and missing required schedule structure", () => {
  const malformed = load(fixture);
  malformed("table.schedule tbody td").first().append("<span>SocEcol ???</span>");
  assert.ok(
    parseSocialEcologyCourseOfferings(malformed.html()).parsingErrors.some((error) =>
      error.includes("unrecognized nonempty schedule fragment"),
    ),
  );
  const missingTable = load(fixture);
  missingTable("table.schedule").remove();
  assert.ok(
    parseSocialEcologyCourseOfferings(missingTable.html()).parsingErrors.some((error) =>
      error.includes("qualifying schedule table"),
    ),
  );
  const missingHeading = load(fixture);
  missingHeading("h1, h2").remove();
  assert.ok(
    parseSocialEcologyCourseOfferings(missingHeading.html()).parsingErrors.some((error) =>
      error.includes("schedule heading"),
    ),
  );
  const missingColumn = load(fixture);
  missingColumn("table.schedule thead th").first().remove();
  assert.ok(
    parseSocialEcologyCourseOfferings(missingColumn.html()).parsingErrors.some((error) =>
      error.includes("Fall quarter column"),
    ),
  );
  const emptyQuarter = load(fixture);
  emptyQuarter("table.schedule tbody tr td:nth-child(1)").html(" ");
  assert.ok(
    parseSocialEcologyCourseOfferings(emptyQuarter.html()).parsingErrors.some((error) =>
      error.includes("empty Fall"),
    ),
  );
});
