import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { load } from "cheerio";
import {
  normalizeAnthropologyCourseId,
  parseAnthropologyAcademicYear,
  parseAnthropologyCourseOfferings,
  parseAnthropologyLastUpdated,
  parseAnthropologyTermHeader,
  selectImportableAnthropologyOfferings,
} from "./lib.ts";

const fixture = await readFile(
  join(dirname(fileURLToPath(import.meta.url)), "../test/fixtures/courses.html"),
  "utf8",
);

test("normalizes numeric, lettered, honors, and recognized topic identifiers", () => {
  assert.equal(normalizeAnthropologyCourseId("2A"), "ANTHRO2A");
  assert.equal(normalizeAnthropologyCourseId("48"), "ANTHRO48");
  assert.equal(normalizeAnthropologyCourseId("121AW"), "ANTHRO121AW");
  assert.equal(normalizeAnthropologyCourseId("H190A"), "ANTHROH190A");
  assert.equal(normalizeAnthropologyCourseId("129 (Special Topics)"), "ANTHRO129");
  assert.equal(normalizeAnthropologyCourseId("169 (Topics Vary)"), "ANTHRO169");
});

test("rejects arbitrary annotations and malformed course identifiers", () => {
  assert.equal(normalizeAnthropologyCourseId("129 (Other)"), null);
  assert.equal(normalizeAnthropologyCourseId("ANTHRO 2A"), null);
  assert.equal(normalizeAnthropologyCourseId("H"), null);
  assert.equal(normalizeAnthropologyCourseId("A21"), null);
});

test("extracts the exact academic year, update date, and canonical quarter years", () => {
  assert.deepEqual(parseAnthropologyAcademicYear(fixture), {
    academicYear: "2026-2027",
    startYear: 2026,
  });
  assert.deepEqual(parseAnthropologyTermHeader("Fall", "2026-2027", 2026), {
    header: "Fall",
    academicYear: "2026-2027",
    year: "2026",
    quarter: "Fall",
  });
  assert.deepEqual(parseAnthropologyTermHeader("Winter", "2026-2027", 2026), {
    header: "Winter",
    academicYear: "2026-2027",
    year: "2027",
    quarter: "Winter",
  });
  const parsed = parseAnthropologyCourseOfferings(fixture);
  assert.deepEqual(
    parsed.terms.map(({ year, quarter }) => `${year} ${quarter}`),
    ["2026 Fall", "2027 Winter", "2027 Spring"],
  );
  assert.equal(parsed.lastUpdated?.toISOString(), "2026-06-03T00:00:00.000Z");
  assert.equal(
    parseAnthropologyLastUpdated("Last updated: June 3, 2026")?.toISOString(),
    "2026-06-03T00:00:00.000Z",
  );
});

test("parses only the undergraduate table and recognized quarter checkmarks", () => {
  const parsed = parseAnthropologyCourseOfferings(fixture);
  assert.equal(parsed.scheduleTablesDiscovered, 1);
  assert.equal(parsed.sourceTableRows, 18);
  assert.equal(parsed.normalizedRows, 18);
  assert.deepEqual(parsed.rawCheckmarkCellsByQuarter, { Fall: 9, Winter: 10, Spring: 7 });
  assert.deepEqual(parsed.offeringsByQuarter, { Fall: 7, Winter: 8, Spring: 5 });
  assert.equal(parsed.offerings.length, 20);
  assert.deepEqual(parsed.parsingErrors, []);
  assert.ok(parsed.offerings.every(({ instructors }) => instructors.length === 0));
  assert.equal(parsed.courseIds.includes("ANTHRO200"), false);
});

test("collapses repeated special-topic and 180AW rows by canonical course and term", () => {
  const parsed = parseAnthropologyCourseOfferings(fixture);
  assert.deepEqual(parsed.duplicateRowsCollapsedByQuarter, { Fall: 2, Winter: 2, Spring: 2 });
  assert.equal(parsed.duplicateTopicRowsCollapsed, 6);
  assert.equal(parsed.duplicate180AwRowsCollapsed, 4);
  assert.deepEqual(
    parsed.offerings
      .filter(({ courseId }) => courseId === "ANTHRO139")
      .map(({ quarter }) => quarter),
    ["Fall", "Winter"],
  );
  assert.deepEqual(
    parsed.offerings
      .filter(({ courseId }) => courseId === "ANTHRO180AW")
      .map(({ quarter }) => quarter),
    ["Fall", "Winter", "Spring"],
  );
});

test("ignores stale title notes and navigation/footer course-like text", () => {
  const parsed = parseAnthropologyCourseOfferings(fixture);
  assert.deepEqual(
    parsed.offerings
      .filter(({ courseId }) => courseId === "ANTHRO100A")
      .map(({ quarter }) => quarter),
    ["Winter", "Spring"],
  );
  assert.equal(parsed.courseIds.includes("ANTHROWEB"), false);
});

test("does not create offerings for a listed course with blank cells", () => {
  const parsed = parseAnthropologyCourseOfferings(fixture);
  assert.ok(parsed.courseIds.includes("ANTHROH190W"));
  assert.equal(
    parsed.offerings.some(({ courseId }) => courseId === "ANTHROH190W"),
    false,
  );
});

test("reports unexpected markers and disables a clean parse", () => {
  const $ = load(fixture);
  $("#undergraduate tbody tr").first().find("td").eq(2).text("planned");
  const parsed = parseAnthropologyCourseOfferings($.html());
  assert.ok(parsed.parsingErrors.some((error) => error.includes("unexpected marker")));
});

test("reports a displayed update date that cannot be parsed reliably", () => {
  const $ = load(fixture);
  $(".schedule p").first().text("Last updated: June 99, 2026");
  const parsed = parseAnthropologyCourseOfferings($.html());
  assert.equal(parsed.lastUpdated, null);
  assert.ok(parsed.parsingErrors.some((error) => error.includes("Last updated value")));
});

test("reports missing heading, table, required quarter, and empty quarter", () => {
  const $ = load(fixture);
  $("h1").text("Undergraduate Course Offerings");
  const missingHeading = parseAnthropologyCourseOfferings($.html());
  assert.equal(missingHeading.academicYear, null);
  assert.ok(missingHeading.parsingErrors.some((error) => error.includes("academic-year")));

  const noTable = load(fixture);
  noTable("#undergraduate").remove();
  const missingTable = parseAnthropologyCourseOfferings(noTable.html());
  assert.ok(missingTable.parsingErrors.some((error) => error.includes("schedule table")));

  const noSpring = load(fixture);
  noSpring("#undergraduate thead th").last().text("Summer");
  const missingSpring = parseAnthropologyCourseOfferings(noSpring.html());
  assert.ok(missingSpring.parsingErrors.some((error) => error.includes("required Spring")));

  const emptyFall = load(fixture);
  emptyFall("#undergraduate tbody tr").each((_index, row) => {
    emptyFall(row).children().eq(2).text("");
  });
  const empty = parseAnthropologyCourseOfferings(emptyFall.html());
  assert.ok(empty.parsingErrors.some((error) => error.includes("no usable Fall")));
});

test("selects only future terms using shared calendar metadata", () => {
  const parsed = parseAnthropologyCourseOfferings(fixture);
  const selected = selectImportableAnthropologyOfferings(
    parsed,
    [
      { year: "2026", quarter: "Fall", instructionStart: new Date("2026-09-24") },
      { year: "2027", quarter: "Winter", instructionStart: new Date("2027-01-04") },
      { year: "2027", quarter: "Spring", instructionStart: new Date("2027-03-29") },
    ],
    new Date("2026-10-01"),
  );
  assert.equal(
    selected.offerings.some(({ quarter }) => quarter === "Fall"),
    false,
  );
  assert.equal(
    selected.offerings.some(({ quarter }) => quarter === "Winter"),
    true,
  );
  assert.equal(
    selected.offerings.some(({ quarter }) => quarter === "Spring"),
    true,
  );
  assert.deepEqual(selected.skippedOrStaleTerms, ["Fall (term has begun)"]);
});
