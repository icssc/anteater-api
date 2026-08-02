import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { load } from "cheerio";
import {
  normalizePoliticalScienceCourseId,
  parsePoliticalScienceAcademicYear,
  parsePoliticalScienceCourseOfferings,
  parsePoliticalScienceLastUpdated,
  parsePoliticalScienceSectionCaption,
  selectImportablePoliticalScienceOfferings,
} from "./lib.ts";

const fixture = await readFile(
  join(dirname(fileURLToPath(import.meta.url)), "../test/fixtures/courses.html"),
  "utf8",
);

test("normalizes department labels, modality annotations, and lettered course IDs", () => {
  assert.equal(normalizePoliticalScienceCourseId("Pol Sci 21A"), "POLSCI21A");
  assert.equal(normalizePoliticalScienceCourseId("Pol Sci 120"), "POLSCI120");
  assert.equal(normalizePoliticalScienceCourseId("Pol Sci 138AW"), "POLSCI138AW");
  assert.equal(normalizePoliticalScienceCourseId("Pol Sci 174CW"), "POLSCI174CW");
  assert.equal(normalizePoliticalScienceCourseId("Pol Sci H182A"), "POLSCIH182A");
  assert.equal(normalizePoliticalScienceCourseId("Pol Sci 151H"), "POLSCI151H");
  assert.equal(normalizePoliticalScienceCourseId("Pol Sci 154K"), "POLSCI154K");
  assert.equal(normalizePoliticalScienceCourseId("Pol Sci 21A [ONLINE]"), "POLSCI21A");
  assert.equal(normalizePoliticalScienceCourseId("Pol Sci 71A [HYBRID]"), "POLSCI71A");
  assert.equal(normalizePoliticalScienceCourseId("Pol Sci 130A[ONLINE]"), "POLSCI130A");
  assert.equal(normalizePoliticalScienceCourseId("Pol Sci 151H [ONLINE]"), "POLSCI151H");
  assert.equal(normalizePoliticalScienceCourseId("Poli Sci 149"), "POLSCI149");
});

test("rejects unrelated department spellings and malformed identifiers", () => {
  assert.equal(normalizePoliticalScienceCourseId("Political Science 21A"), null);
  assert.equal(normalizePoliticalScienceCourseId("PoliScience 21A"), null);
  assert.equal(normalizePoliticalScienceCourseId("Pol Sci A21"), null);
  assert.equal(normalizePoliticalScienceCourseId("Pol Sci 21A [REMOTE]"), null);
  assert.equal(normalizePoliticalScienceCourseId("Pol Sci H"), null);
});

test("extracts the academic year and all three quarter section captions", () => {
  assert.deepEqual(parsePoliticalScienceAcademicYear(fixture), {
    academicYear: "2026-2027",
    startYear: 2026,
  });
  assert.deepEqual(parsePoliticalScienceSectionCaption(" FALL QUARTER 2026"), {
    header: "FALL QUARTER 2026",
    quarter: "Fall",
    year: "2026",
  });
  const parsed = parsePoliticalScienceCourseOfferings(fixture);
  assert.deepEqual(
    parsed.terms.map(({ year, quarter }) => `${year} ${quarter}`),
    ["2026 Fall", "2027 Winter", "2027 Spring"],
  );
});

test("parses the displayed update date as UTC midnight", () => {
  const parsed = parsePoliticalScienceCourseOfferings(fixture);
  assert.equal(parsed.lastUpdated?.toISOString(), "2026-06-03T00:00:00.000Z");
  assert.equal(
    parsePoliticalScienceLastUpdated("Last updated: June 03, 2026")?.toISOString(),
    "2026-06-03T00:00:00.000Z",
  );
});

test("parses all three quarter tables and counts topic collapses by term", () => {
  const parsed = parsePoliticalScienceCourseOfferings(fixture);
  assert.equal(parsed.scheduleTablesDiscovered, 3);
  assert.deepEqual(parsed.sourceRowsByQuarter, { Fall: 9, Winter: 10, Spring: 9 });
  assert.deepEqual(parsed.normalizedRowsByQuarter, { Fall: 9, Winter: 10, Spring: 9 });
  assert.deepEqual(parsed.offeringsByQuarter, { Fall: 6, Winter: 5, Spring: 7 });
  assert.deepEqual(parsed.duplicateTopicRowsCollapsedByQuarter, {
    Fall: 3,
    Winter: 5,
    Spring: 2,
  });
  assert.equal(parsed.offerings.length, 18);
  assert.equal(parsed.courseIds.length, 12);
  assert.deepEqual(parsed.parsingErrors, []);
});

test("creates one offering per valid row's enclosing term and preserves cross-quarter courses", () => {
  const parsed = parsePoliticalScienceCourseOfferings(fixture);
  const quartersFor = (courseId: string) =>
    parsed.offerings
      .filter((offering) => offering.courseId === courseId)
      .map(({ quarter }) => quarter);

  assert.deepEqual(quartersFor("POLSCI21A"), ["Fall", "Winter", "Spring"]);
  assert.deepEqual(quartersFor("POLSCI139"), ["Fall", "Winter"]);
  assert.deepEqual(quartersFor("POLSCI149"), ["Fall", "Spring"]);
  assert.deepEqual(quartersFor("POLSCI159"), ["Winter", "Spring"]);
  assert.deepEqual(quartersFor("POLSCI179"), ["Winter", "Spring"]);
});

test("preserves H182A, AW, CW, H, and K suffix forms", () => {
  const parsed = parsePoliticalScienceCourseOfferings(fixture);
  for (const courseId of [
    "POLSCIH182A",
    "POLSCI138AW",
    "POLSCI174CW",
    "POLSCI151H",
    "POLSCI154K",
  ]) {
    assert.ok(parsed.courseIds.includes(courseId));
  }
});

test("ignores title course-like text and navigation/footer content", () => {
  const parsed = parsePoliticalScienceCourseOfferings(fixture);
  assert.equal(parsed.courseIds.includes("POLSCI1999"), false);
  assert.equal(parsed.courseIds.includes("POLSCI21A[ONLINE]"), false);
  assert.equal(parsed.courseIds.includes("POLSCIWEB SOC"), false);
});

test("stores empty instructors for every offering", () => {
  const parsed = parsePoliticalScienceCourseOfferings(fixture);
  assert.ok(parsed.offerings.every(({ instructors }) => instructors.length === 0));
});

test("reports malformed nonempty course rows and does not silently drop them", () => {
  const $ = load(fixture);
  $("#fall tbody").append("<tr><td>Political Science 300</td><td>Bad department label</td></tr>");
  const parsed = parsePoliticalScienceCourseOfferings($.html());
  assert.equal(parsed.sourceRowsByQuarter.Fall, 10);
  assert.ok(parsed.parsingErrors.some((error) => error.includes("malformed course identifier")));
});

test("ignores blank rows and recognized repeated table headers", () => {
  const $ = load(fixture);
  $("#fall tbody").append("<tr><td></td><td></td></tr>");
  $("#fall tbody").append("<tr><td>Course Number</td><td>Course Title</td></tr>");
  const parsed = parsePoliticalScienceCourseOfferings($.html());
  assert.equal(parsed.sourceRowsByQuarter.Fall, 9);
  assert.deepEqual(parsed.parsingErrors, []);
});

test("reports a missing academic-year heading", () => {
  const $ = load(fixture);
  $("h1").text("Undergraduate Course Offerings");
  const parsed = parsePoliticalScienceCourseOfferings($.html());
  assert.equal(parsed.academicYear, null);
  assert.ok(parsed.parsingErrors.some((error) => error.includes("academic-year schedule heading")));
});

test("reports a malformed displayed update date", () => {
  const $ = load(fixture);
  $(".schedule p")
    .filter((_index, element) => $(element).text().includes("Last updated"))
    .text("Last updated: June 99, 2026");
  const parsed = parsePoliticalScienceCourseOfferings($.html());
  assert.equal(parsed.lastUpdated, null);
  assert.ok(parsed.parsingErrors.some((error) => error.includes("Last updated value")));
});

test("reports missing quarter sections and missing tables", () => {
  const $ = load(fixture);
  $("#winter").remove();
  const parsed = parsePoliticalScienceCourseOfferings($.html());
  assert.ok(
    parsed.parsingErrors.some((error) => error.includes("missing its Winter quarter table")),
  );
  assert.ok(parsed.parsingErrors.some((error) => error.includes("no usable Winter offerings")));
});

test("reports an unexpectedly empty required quarter", () => {
  const $ = load(fixture);
  $("#fall tbody tr").remove();
  const parsed = parsePoliticalScienceCourseOfferings($.html());
  assert.ok(parsed.parsingErrors.some((error) => error.includes("no usable Fall offerings")));
});

test("selects only exact future terms using shared calendar metadata", () => {
  const parsed = parsePoliticalScienceCourseOfferings(fixture);
  const selected = selectImportablePoliticalScienceOfferings(
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
  assert.deepEqual(selected.skippedOrStaleTerms, ["FALL QUARTER 2026 (term has begun)"]);
});
