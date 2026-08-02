import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { load } from "cheerio";
import {
  extractCognitiveSciencesCourseIds,
  normalizeCognitiveSciencesCourseId,
  parseCognitiveAcademicYear,
  parseCognitiveSciencesCourseOfferings,
  parseCognitiveTermHeader,
  resolveCognitiveInstructors,
  selectImportableCognitiveOfferings,
} from "./lib.ts";

const fixture = await readFile(
  join(dirname(fileURLToPath(import.meta.url)), "../test/fixtures/undergraduate.html"),
  "utf8",
);

test("normalizes numeric, letter-prefixed, and letter-suffixed COGS IDs", () => {
  assert.equal(normalizeCognitiveSciencesCourseId("COGS 9A"), "COGS9A");
  assert.equal(normalizeCognitiveSciencesCourseId("COGS H101A"), "COGSH101A");
  assert.equal(normalizeCognitiveSciencesCourseId("COGS 109W"), "COGS109W");
  assert.equal(normalizeCognitiveSciencesCourseId("COGS 121S"), "COGS121S");
  assert.equal(normalizeCognitiveSciencesCourseId("PSY 9"), null);
  assert.equal(normalizeCognitiveSciencesCourseId("COGS 0009A"), "COGS9A");
});

test("expands same-department lecture/lab shorthand and ignores cross-lists", () => {
  assert.deepEqual(extractCognitiveSciencesCourseIds("COGS 112E/LE (formerly 119)"), [
    "COGS112E",
    "COGS112LE",
  ]);
  assert.deepEqual(extractCognitiveSciencesCourseIds("COGS 112N-LN"), ["COGS112N", "COGS112LN"]);
  assert.deepEqual(extractCognitiveSciencesCourseIds("COGS 112P-LP"), ["COGS112P", "COGS112LP"]);
  assert.deepEqual(extractCognitiveSciencesCourseIds("COGS 7A/PSY 9"), ["COGS7A"]);
  assert.deepEqual(extractCognitiveSciencesCourseIds("COGS 161/BIO SCI N160/LSCI 158"), [
    "COGS161",
  ]);
});

test("extracts the explicit academic year and required term headers", () => {
  assert.equal(parseCognitiveAcademicYear(fixture), "2026-2027");
  assert.deepEqual(parseCognitiveTermHeader("FALL 2026 COURSES:")?.year, "2026");
  assert.deepEqual(parseCognitiveTermHeader("WINTER 2027 COURSES:"), {
    header: "WINTER 2027 COURSES:",
    academicYear: "2026-2027",
    year: "2027",
    quarter: "Winter",
  });
  assert.equal(parseCognitiveTermHeader("SUMMER 2027 COURSES:"), null);
});

test("parses only the COURSE OFFERINGS tables and all three terms", () => {
  const parsed = parseCognitiveSciencesCourseOfferings(fixture);
  assert.deepEqual(
    parsed.terms.map(({ year, quarter }) => `${year} ${quarter}`),
    ["2026 Fall", "2027 Winter", "2027 Spring"],
  );
  assert.equal(parsed.sourceTableRows, 60);
  assert.equal(parsed.normalizedCourseRows, 60);
  assert.deepEqual(parsed.offeringsByQuarter, {
    Fall: 26,
    Winter: 21,
    Spring: 14,
  });
  assert.equal(parsed.lastUpdated, null);
  assert.deepEqual(parsed.parsingErrors, []);
});

test("preserves COGS IDs while excluding degree tables and other departments", () => {
  const parsed = parseCognitiveSciencesCourseOfferings(fixture);
  assert.ok(parsed.courseIds.includes("COGS7A"));
  assert.ok(parsed.courseIds.includes("COGSH101A"), JSON.stringify(parsed.courseIds));
  assert.ok(parsed.courseIds.includes("COGS109W"));
  assert.ok(parsed.courseIds.includes("COGS123M"));
  assert.equal(parsed.courseIds.includes("PSY9"), false);
  assert.equal(parsed.courseIds.includes("COGS9C"), false);
  assert.ok(parsed.crossListedNonCogsIdsIgnored.length > 0);
});

test("collapses repeated COGS 189 topic rows and merges instructors", () => {
  const parsed = parseCognitiveSciencesCourseOfferings(fixture);
  const winter189 = parsed.offerings.find(
    (offering) => offering.courseId === "COGS189" && offering.quarter === "Winter",
  );
  const spring189 = parsed.offerings.find(
    (offering) => offering.courseId === "COGS189" && offering.quarter === "Spring",
  );
  assert.deepEqual(
    winter189?.instructors.map(({ name }) => name),
    ["Saberi", "Lewis", "Liljeholm"],
  );
  assert.deepEqual(
    spring189?.instructors.map(({ name }) => name),
    ["Mednick", "Lewis"],
  );
  assert.equal(parsed.duplicateCogs189RowsCollapsed, 3);
});

test("treats restrictions and historical renumbering as metadata", () => {
  const parsed = parseCognitiveSciencesCourseOfferings(fixture);
  assert.ok(parsed.courseIds.includes("COGS112E"));
  assert.ok(parsed.courseIds.includes("COGS112LE"));
  assert.equal(parsed.courseIds.includes("COGS119"), false);
  assert.ok(
    parsed.renumberingNotesObserved.some((note) => /formerly|previously|renumbering/i.test(note)),
  );
});

test("ignores Staff and Offered by placeholders while retaining resolvable names", () => {
  const parsed = parseCognitiveSciencesCourseOfferings(fixture);
  assert.ok(parsed.ignoredStaffValues.includes("Staff"));
  assert.ok(parsed.ignoredOfferedByValues.includes("Offered by LSCI"));
  assert.equal(parsed.ignoredPlaceholderAssignments, 4);
  assert.ok(parsed.parsedInstructorAssignments > 0);
  const resolved = resolveCognitiveInstructors(
    [
      { name: "Hagedorn", isPlaceholder: false },
      { name: "Staff", isPlaceholder: true },
    ],
    [{ name: "Hagedorn, Sarah", ucinetid: "shagedor" }],
  );
  assert.deepEqual(resolved.instructors, [
    { status: "assigned", name: "Hagedorn, Sarah", ucinetid: "shagedor" },
  ]);
});

test("reports malformed apparent rows and disables a malformed import", () => {
  const $ = load(fixture);
  $("p")
    .filter((_, element) => $(element).text().trim() === "FALL 2026 COURSES:")
    .nextAll()
    .find("tbody")
    .first()
    .append(
      "<tr><td data-label='Course Number'>Not a COGS course</td><td data-label='Course Title'>Bad</td><td data-label='Instructor'>Staff</td></tr>",
    );
  const parsed = parseCognitiveSciencesCourseOfferings($.html());
  assert.ok(parsed.parsingErrors.some((error) => error.includes("no valid COGS identifier")));
});

test("reports missing sections and required columns", () => {
  const $ = load(fixture);
  $("p")
    .filter((_, element) => $(element).text().trim() === "SPRING 2027 COURSES:")
    .remove();
  const parsed = parseCognitiveSciencesCourseOfferings($.html());
  assert.ok(parsed.parsingErrors.some((error) => error.includes("missing its Spring section")));

  const withoutInstructor = load(fixture);
  withoutInstructor("table").last().find("thead th").eq(2).text("Faculty");
  const columnsParsed = parseCognitiveSciencesCourseOfferings(withoutInstructor.html());
  assert.ok(columnsParsed.parsingErrors.some((error) => error.includes("qualifying tables")));
});

test("selects only future calendar terms", () => {
  const parsed = parseCognitiveSciencesCourseOfferings(fixture);
  const selected = selectImportableCognitiveOfferings(
    parsed,
    [
      {
        year: "2026",
        quarter: "Fall",
        instructionStart: new Date("2026-09-24"),
      },
      {
        year: "2027",
        quarter: "Winter",
        instructionStart: new Date("2027-01-04"),
      },
      {
        year: "2027",
        quarter: "Spring",
        instructionStart: new Date("2027-03-29"),
      },
    ],
    new Date("2026-08-02"),
  );
  assert.deepEqual(
    selected.scopes.map(({ year, quarter }) => `${year} ${quarter}`),
    ["2026 Fall", "2027 Winter", "2027 Spring"],
  );
  const afterFall = selectImportableCognitiveOfferings(
    parsed,
    [
      {
        year: "2026",
        quarter: "Fall",
        instructionStart: new Date("2026-09-24"),
      },
      {
        year: "2027",
        quarter: "Winter",
        instructionStart: new Date("2027-01-04"),
      },
      {
        year: "2027",
        quarter: "Spring",
        instructionStart: new Date("2027-03-29"),
      },
    ],
    new Date("2026-10-01"),
  );
  assert.equal(
    afterFall.offerings.some(({ quarter }) => quarter === "Fall"),
    false,
  );
});
