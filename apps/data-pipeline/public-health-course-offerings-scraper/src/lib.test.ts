import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { load } from "cheerio";
import {
  normalizePublicHealthCourseId,
  parsePublicHealthAcademicYear,
  parsePublicHealthCourseOfferings,
  parsePublicHealthInstructorNames,
  parsePublicHealthLastUpdated,
  resolvePublicHealthInstructors,
  selectImportablePublicHealthOfferings,
} from "./lib.ts";

const fixture = await readFile(
  join(dirname(fileURLToPath(import.meta.url)), "../test/fixtures/course-offerings.html"),
  "utf8",
);

test("normalizes Public Health source departments and all course-number shapes", () => {
  assert.equal(normalizePublicHealthCourseId("PUBHLTH 1"), "PUBHLTH1");
  assert.equal(normalizePublicHealthCourseId("PUBHLTH 7A"), "PUBHLTH7A");
  assert.equal(normalizePublicHealthCourseId("PUBHLTH H192A"), "PUBHLTHH192A");
  assert.equal(normalizePublicHealthCourseId("PUBHLTH 204A"), "PUBHLTH204A");
  assert.equal(normalizePublicHealthCourseId("PUBHLTH 295B"), "PUBHLTH295B");
  assert.equal(normalizePublicHealthCourseId("PUBHLTH 295AB"), "PUBHLTH295AB");
  assert.equal(normalizePublicHealthCourseId("EHS 206B"), "EHS206B");
  assert.equal(normalizePublicHealthCourseId("EPIDEM 200A"), "EPIDEM200A");
  assert.equal(normalizePublicHealthCourseId("CHEM 1A"), null);
  assert.equal(normalizePublicHealthCourseId("PUBHLTH 1/2"), null);
});

test("extracts the explicit academic year and displayed update date", () => {
  assert.deepEqual(parsePublicHealthAcademicYear(fixture), {
    academicYear: "2026-2027",
    startYear: 2026,
  });
  assert.equal(parsePublicHealthLastUpdated(fixture)?.toISOString(), "2026-05-06T00:00:00.000Z");
});

test("discovers both schedule sections and derives all three canonical terms", () => {
  const parsed = parsePublicHealthCourseOfferings(fixture);

  assert.deepEqual(
    parsed.sections.map(({ level }) => level),
    ["undergraduate", "graduate"],
  );
  assert.deepEqual(
    parsed.terms.map(({ year, quarter }) => `${year} ${quarter}`),
    ["2026 Fall", "2027 Winter", "2027 Spring"],
  );
  assert.equal(parsed.undergraduateSourceRows, 12);
  assert.equal(parsed.graduateSourceRows, 14);
  assert.equal(parsed.normalizedCourseRows, 26);
  assert.equal(parsed.offerings.length, 28);
  assert.equal(parsed.courseIds.length, 20);
  assert.equal(parsed.parsedInstructorAssignments, 0);
  assert.deepEqual(parsed.parsingErrors, []);
});

test("removes footnote superscripts and supports honors and graduate identifiers", () => {
  const parsed = parsePublicHealthCourseOfferings(fixture);
  assert.ok(parsed.courseIds.includes("PUBHLTH10"));
  assert.equal(parsed.courseIds.includes("PUBHLTH101"), false);
  assert.ok(parsed.courseIds.includes("PUBHLTHH192A"));
  assert.ok(parsed.courseIds.includes("EPIDEM275"));
  assert.ok(parsed.courseIds.includes("PUBHLTH295"));
});

test("preserves repeated courses across terms and deduplicates same-term special topics", () => {
  const parsed = parsePublicHealthCourseOfferings(fixture);
  assert.deepEqual(
    parsed.offerings
      .filter(({ courseId }) => courseId === "PUBHLTH1")
      .map(({ year, quarter }) => `${year} ${quarter}`),
    ["2026 Fall", "2027 Winter", "2027 Spring"],
  );
  assert.equal(
    parsed.offerings.filter(
      ({ courseId, quarter }) => courseId === "PUBHLTH10" && quarter === "Spring",
    ).length,
    1,
  );
  assert.equal(
    parsed.offerings.filter(
      ({ courseId, quarter }) => courseId === "EPIDEM275" && quarter === "Spring",
    ).length,
    1,
  );
  assert.equal(
    parsed.offerings.filter(
      ({ courseId, quarter }) => courseId === "PUBHLTH290" && quarter === "Fall",
    ).length,
    1,
  );
});

test("uses only structured quarter markers and ignores titles, notes, and concurrent courses", () => {
  const parsed = parsePublicHealthCourseOfferings(fixture);
  assert.equal(parsed.courseIds.includes("PUBHLTH239"), false);
  assert.equal(parsed.courseIds.includes("EPIDEM239"), false);
  assert.equal(parsed.courseIds.includes("EHS290"), false);
  assert.deepEqual(
    parsed.offerings
      .filter(({ courseId }) => courseId === "PUBHLTH290")
      .map(({ quarter }) => quarter),
    ["Fall"],
  );

  const $ = load(fixture);
  $(".wp-block-toggle").first().find("tbody tr").first().children("td").eq(2).text("—");
  const withUnofferedMarker = parsePublicHealthCourseOfferings($.html());
  assert.equal(
    withUnofferedMarker.offerings.some(
      ({ courseId, quarter }) => courseId === "PUBHLTH1" && quarter === "Fall",
    ),
    false,
  );
  assert.deepEqual(withUnofferedMarker.parsingErrors, []);
});

test("stores empty instructors when the live schedule has no instructor columns", () => {
  const parsed = parsePublicHealthCourseOfferings(fixture);
  assert.ok(parsed.offerings.every(({ instructors }) => instructors.length === 0));
  assert.deepEqual(parsePublicHealthInstructorNames("TBD / TBA"), []);
  assert.deepEqual(parsePublicHealthInstructorNames("Nguyen / Nguyen; Smith"), ["Nguyen", "Smith"]);
});

test("resolves optional explicit instructors only when unambiguous", () => {
  assert.deepEqual(
    resolvePublicHealthInstructors(
      ["Nguyen"],
      [
        { ucinetid: "one", name: "Alice Nguyen", department: "Public Health" },
        { ucinetid: "two", name: "Bob Nguyen", department: "Public Health" },
      ],
    ),
    [],
  );
  assert.deepEqual(
    resolvePublicHealthInstructors(
      ["Smith, Jordan"],
      [
        {
          ucinetid: "jsmith",
          name: "Jordan A Smith",
          department: "Epidemiology",
        },
      ],
    ),
    [{ status: "assigned", name: "Smith, Jordan", ucinetid: "jsmith" }],
  );
});

test("ignores blank rows and reports malformed nonblank rows", () => {
  const $ = load(fixture);
  $(".wp-block-toggle").first().find("tbody").prepend("<tr><td>PUBHLTH 99</td></tr>");
  const parsed = parsePublicHealthCourseOfferings($.html());

  assert.equal(parsed.undergraduateSourceRows, 13);
  assert.ok(parsed.parsingErrors.some((error) => error.includes("missing required cells")));
});

test("reports missing or empty required undergraduate and graduate sections", () => {
  const missingUndergraduate = load(fixture);
  missingUndergraduate(".wp-block-toggle").first().remove();
  const parsedMissing = parsePublicHealthCourseOfferings(missingUndergraduate.html());
  assert.ok(
    parsedMissing.parsingErrors.some((error) => error.includes("missing its undergraduate")),
  );

  const emptyGraduate = load(fixture);
  emptyGraduate(".wp-block-toggle").eq(1).find("tbody").empty();
  const parsedEmpty = parsePublicHealthCourseOfferings(emptyGraduate.html());
  assert.ok(
    parsedEmpty.parsingErrors.some((error) => error.includes("no usable graduate course rows")),
  );
});

test("reports missing and unexpectedly empty quarter data", () => {
  const missingColumn = load(fixture);
  missingColumn(".wp-block-toggle").first().find("thead th").eq(4).text("summer quarter");
  const parsedMissing = parsePublicHealthCourseOfferings(missingColumn.html());
  assert.ok(
    parsedMissing.parsingErrors.some((error) => error.includes("structured schedule table")),
  );

  const emptySpring = load(fixture);
  emptySpring(".wp-block-toggle")
    .first()
    .find("tbody tr")
    .each((_, row) => {
      emptySpring(row).children("td").eq(4).empty();
    });
  const parsedEmpty = parsePublicHealthCourseOfferings(emptySpring.html());
  assert.ok(
    parsedEmpty.parsingErrors.some((error) =>
      error.includes("undergraduate schedule has no offered Spring"),
    ),
  );
});

test("returns null and reports malformed displayed update dates", () => {
  const malformed = fixture.replace(/May 6,\s+2026/, "May sixth, 2026");
  assert.equal(parsePublicHealthLastUpdated(malformed), null);
  assert.ok(
    parsePublicHealthCourseOfferings(malformed).parsingErrors.some((error) =>
      error.includes("last updated"),
    ),
  );

  const absent = load(fixture);
  absent("em").remove();
  assert.equal(parsePublicHealthLastUpdated(absent.html()), null);
});

test("selects exact future terms using calendar metadata", () => {
  const parsed = parsePublicHealthCourseOfferings(fixture);
  const selected = selectImportablePublicHealthOfferings(
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
  assert.deepEqual(selected.skippedOrStaleTerms, ["Fall quarter (term has begun)"]);
});
