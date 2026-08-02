import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { load } from "cheerio";
import {
  normalizeEconomicsCourseId,
  parseEconomicsAcademicYear,
  parseEconomicsCourseOfferings,
  parseEconomicsTermHeader,
  selectImportableEconomicsOfferings,
} from "./lib.ts";

const fixture = await readFile(
  join(dirname(fileURLToPath(import.meta.url)), "../test/fixtures/list.html"),
  "utf8",
);

test("normalizes numeric, suffix-letter, H-prefixed, and combined course IDs", () => {
  assert.equal(normalizeEconomicsCourseId("1"), "ECON1");
  assert.equal(normalizeEconomicsCourseId("20A"), "ECON20A");
  assert.equal(normalizeEconomicsCourseId("H80"), "ECONH80");
  assert.equal(normalizeEconomicsCourseId("H190A"), "ECONH190A");
  assert.equal(normalizeEconomicsCourseId("123CW"), "ECON123CW");
  assert.equal(normalizeEconomicsCourseId("190BW"), "ECON190BW");
  assert.equal(normalizeEconomicsCourseId("164AW"), "ECON164AW");
  assert.equal(normalizeEconomicsCourseId("ECON 15"), null);
});

test("keeps ECON 15 as ECON15 rather than expanding a sequence", () => {
  assert.equal(normalizeEconomicsCourseId("15"), "ECON15");
  const parsed = parseEconomicsCourseOfferings(fixture);
  assert.ok(parsed.courseIds.includes("ECON15"));
  assert.equal(parsed.courseIds.includes("ECON15A"), false);
  assert.equal(parsed.courseIds.includes("ECON15B"), false);
});

test("extracts the explicit academic year and quarter headers", () => {
  assert.deepEqual(parseEconomicsAcademicYear(fixture), {
    academicYear: "2026-2027",
    startYear: 2026,
  });
  assert.deepEqual(parseEconomicsTermHeader("Fall 2026", "2026-2027"), {
    header: "Fall 2026",
    academicYear: "2026-2027",
    year: "2026",
    quarter: "Fall",
  });
  const parsed = parseEconomicsCourseOfferings(fixture);
  assert.deepEqual(
    parsed.terms.map(({ year, quarter }) => `${year} ${quarter}`),
    ["2026 Fall", "2027 Winter", "2027 Spring"],
  );
});

test("discovers every qualifying category table and ignores navigation/footer tables", () => {
  const parsed = parseEconomicsCourseOfferings(fixture);
  assert.equal(parsed.scheduleTablesDiscovered, 6);
  assert.deepEqual(parsed.categoryNamesDiscovered, [
    "Lower Division Electives",
    "Lower Division & Required Courses",
    "Management Electives",
    "Business Electives",
    "Quantitative Electives",
    "Other Electives",
  ]);
});

test("parses source rows, terms, and duplicate course-term offerings", () => {
  const parsed = parseEconomicsCourseOfferings(fixture);
  assert.equal(parsed.sourceTableRows, 15);
  assert.equal(parsed.normalizedCourseRows, 15);
  assert.deepEqual(parsed.offeringsByQuarter, { Fall: 6, Winter: 6, Spring: 7 });
  assert.equal(parsed.offerings.length, 19);
  assert.equal(parsed.courseIds.length, 12);
  assert.equal(parsed.duplicateRowsCollapsed, 3);
  assert.deepEqual(parsed.parsingErrors, []);
});

test("creates one-term and multi-term offerings from recognized checkmarks", () => {
  const parsed = parseEconomicsCourseOfferings(fixture);
  const quartersFor = (courseId: string) =>
    parsed.offerings
      .filter((offering) => offering.courseId === courseId)
      .map(({ quarter }) => quarter);

  assert.deepEqual(quartersFor("ECON1"), ["Fall"]);
  assert.deepEqual(quartersFor("ECON13"), ["Fall", "Winter", "Spring"]);
  assert.deepEqual(quartersFor("ECON17"), ["Spring"]);
  assert.deepEqual(quartersFor("ECON15"), ["Fall", "Winter", "Spring"]);
  assert.deepEqual(quartersFor("ECON131A"), ["Fall"]);
});

test("accepts Unicode checkmark equivalents and rejects unexpected markers", () => {
  const $ = load(fixture);
  const firstRow = $(".tentative-schedule table").first().find("tbody tr").first();
  firstRow.children("td").eq(2).text("x");
  const parsed = parseEconomicsCourseOfferings($.html());
  assert.ok(parsed.parsingErrors.some((error) => error.includes("unexpected marker 'x'")));
  assert.equal(
    parsed.offerings.some(({ courseId, quarter }) => courseId === "ECON1" && quarter === "Fall"),
    false,
  );
});

test("does not create offerings for empty quarter cells", () => {
  const parsed = parseEconomicsCourseOfferings(fixture);
  assert.equal(
    parsed.offerings.some(({ courseId, quarter }) => courseId === "ECON1" && quarter !== "Fall"),
    false,
  );
});

test("treats title wording and spelling as descriptive only", () => {
  const $ = load(fixture);
  $(".tentative-schedule table")
    .first()
    .find("tbody tr")
    .first()
    .children("td")
    .eq(1)
    .text("Econmics 15A (honors)");
  const parsed = parseEconomicsCourseOfferings($.html());
  assert.ok(parsed.offerings.some(({ courseId }) => courseId === "ECON1"));
  assert.equal(parsed.courseIds.includes("ECON15A"), false);
});

test("keeps instructors empty and lastUpdated nullable", () => {
  const parsed = parseEconomicsCourseOfferings(fixture);
  assert.ok(parsed.offerings.every(({ instructors }) => instructors.length === 0));
  assert.equal(parsed.lastUpdated, null);
});

test("reports malformed course numbers without aliases", () => {
  const $ = load(fixture);
  $(".tentative-schedule table")
    .first()
    .find("tbody")
    .append("<tr><td>ECON15A</td><td>Invalid source ID</td><td>✓</td><td></td><td></td></tr>");
  const parsed = parseEconomicsCourseOfferings($.html());
  assert.ok(parsed.parsingErrors.some((error) => error.includes("malformed course identifier")));
  assert.equal(parsed.courseIds.includes("ECON15A"), false);
});

test("ignores blank rows and reports malformed rows", () => {
  const $ = load(fixture);
  $(".tentative-schedule table")
    .first()
    .find("tbody")
    .append("<tr><td></td><td></td><td></td><td></td><td></td></tr>");
  $(".tentative-schedule table")
    .first()
    .find("tbody")
    .append("<tr><td>300</td><td>Incomplete row</td></tr>");
  const parsed = parseEconomicsCourseOfferings($.html());
  assert.equal(parsed.sourceTableRows, 16);
  assert.ok(parsed.parsingErrors.some((error) => error.includes("missing required cells")));
});

test("reports a missing tentative-schedule heading", () => {
  const $ = load(fixture);
  $("h1").text("Course Offerings");
  const parsed = parseEconomicsCourseOfferings($.html());
  assert.equal(parsed.academicYear, null);
  assert.ok(
    parsed.parsingErrors.some((error) => error.includes("valid tentative-schedule heading")),
  );
});

test("reports missing qualifying schedule tables", () => {
  const $ = load(fixture);
  $(".tentative-schedule table").remove();
  const parsed = parseEconomicsCourseOfferings($.html());
  assert.equal(parsed.scheduleTablesDiscovered, 0);
  assert.ok(parsed.parsingErrors.some((error) => error.includes("qualifying tentative schedule")));
});

test("reports missing required quarter columns", () => {
  const $ = load(fixture);
  $(".tentative-schedule table").first().find("thead th").eq(4).text("Summer 2027");
  const parsed = parseEconomicsCourseOfferings($.html());
  assert.ok(
    parsed.parsingErrors.some((error) =>
      error.includes("Lower Division Electives table is missing its required Spring column"),
    ),
  );
});

test("reports unexpectedly empty overall quarter output", () => {
  const $ = load(fixture);
  $(".tentative-schedule table tbody tr").each((_index, row) => {
    $(row).children("td").eq(2).empty();
  });
  const parsed = parseEconomicsCourseOfferings($.html());
  assert.ok(parsed.parsingErrors.some((error) => error.includes("no usable Fall offerings")));
});

test("selects only exact future source terms using shared calendar metadata", () => {
  const parsed = parseEconomicsCourseOfferings(fixture);
  const selected = selectImportableEconomicsOfferings(
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
  assert.deepEqual(selected.skippedOrStaleTerms, ["Fall 2026 (term has begun)"]);
});
