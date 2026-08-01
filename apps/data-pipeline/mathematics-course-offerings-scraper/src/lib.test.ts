import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  expandMathCourseIds,
  normalizeMathCourseId,
  parseMathCourseOfferings,
  selectImportableMathOfferings,
} from "./lib.ts";

const fixture = await readFile(
  join(dirname(fileURLToPath(import.meta.url)), "../test/fixtures/course-offerings.html"),
  "utf8",
);

test("normalizes every Math course-number shape used by the source", () => {
  assert.equal(normalizeMathCourseId("8"), "MATH8");
  assert.equal(normalizeMathCourseId("10"), "MATH10");
  assert.equal(normalizeMathCourseId("115"), "MATH115");
  assert.equal(normalizeMathCourseId("2A"), "MATH2A");
  assert.equal(normalizeMathCourseId("105A"), "MATH105A");
  assert.equal(normalizeMathCourseId("120C"), "MATH120C");
  assert.equal(normalizeMathCourseId("H2D"), "MATHH2D");
  assert.equal(normalizeMathCourseId("H120A"), "MATHH120A");
  assert.equal(normalizeMathCourseId("2AX"), "MATH2AX");
  assert.equal(normalizeMathCourseId("13X"), "MATH13X");
  assert.equal(normalizeMathCourseId("195W"), "MATH195W");
  assert.equal(normalizeMathCourseId("105LA"), "MATH105LA");
  assert.equal(normalizeMathCourseId("107L"), "MATH107L");
  assert.equal(normalizeMathCourseId("184L"), "MATH184L");
  assert.equal(normalizeMathCourseId("192**"), "MATH192");
  assert.equal(normalizeMathCourseId("CHEM 1A"), null);
});

test("expands slash- and ampersand-separated course cells", () => {
  assert.deepEqual(expandMathCourseIds("105A/105LA"), ["MATH105A", "MATH105LA"]);
  assert.deepEqual(expandMathCourseIds("105B/105LB"), ["MATH105B", "MATH105LB"]);
  assert.deepEqual(expandMathCourseIds("107/107L"), ["MATH107", "MATH107L"]);
  assert.deepEqual(expandMathCourseIds("184 & 184L"), ["MATH184", "MATH184L"]);
});

test("parses lower- and upper-division tables and page metadata", () => {
  const parsed = parseMathCourseOfferings(fixture);

  assert.equal(parsed.sourceRowsParsed, 19);
  assert.equal(parsed.expandedCourseRows, 23);
  assert.equal(parsed.offerings.length, 26);
  assert.equal(parsed.academicYear, "2026-2027");
  assert.equal(parsed.lastUpdated?.toISOString(), "2026-05-14T00:00:00.000Z");
  assert.deepEqual(
    parsed.sections.map(({ name }) => name),
    ["Mathematics Lower-Division Course Offerings", "Mathematics Upper-Division Course Offerings"],
  );
  assert.deepEqual(parsed.parsingErrors, []);
});

test("derives Fall, Winter, and Spring terms from the academic-year heading", () => {
  const parsed = parseMathCourseOfferings(fixture);

  assert.deepEqual(parsed.sections[0].terms, [
    { header: "Fall", academicYear: "2026-2027", year: "2026", quarter: "Fall" },
    { header: "Winter", academicYear: "2026-2027", year: "2027", quarter: "Winter" },
    { header: "Spring", academicYear: "2026-2027", year: "2027", quarter: "Spring" },
  ]);
});

test("applies a combined row's explicit quarters to every named course", () => {
  const parsed = parseMathCourseOfferings(fixture);

  assert.deepEqual(
    parsed.offerings
      .filter(({ courseId }) => ["MATH105A", "MATH105LA"].includes(courseId))
      .map(({ courseId, year, quarter }) => ({ courseId, year, quarter })),
    [
      { courseId: "MATH105A", year: "2026", quarter: "Fall" },
      { courseId: "MATH105LA", year: "2026", quarter: "Fall" },
    ],
  );
  assert.deepEqual(
    parsed.offerings
      .filter(({ courseId }) => ["MATH184", "MATH184L"].includes(courseId))
      .map(({ courseId, year, quarter }) => ({ courseId, year, quarter })),
    [
      { courseId: "MATH184", year: "2027", quarter: "Spring" },
      { courseId: "MATH184L", year: "2027", quarter: "Spring" },
    ],
  );
});

test("uses only quarter cells and ignores summer-only, stale, and contradictory title notes", () => {
  const parsed = parseMathCourseOfferings(fixture);
  const termsByCourse = (courseId: string) =>
    parsed.offerings
      .filter((offering) => offering.courseId === courseId)
      .map(({ year, quarter }) => `${year} ${quarter}`);

  assert.deepEqual(termsByCourse("MATH1A"), []);
  assert.deepEqual(termsByCourse("MATH195W"), []);
  assert.deepEqual(termsByCourse("MATH112C"), ["2027 Spring"]);
  assert.deepEqual(termsByCourse("MATH120C"), ["2027 Spring"]);
  assert.deepEqual(termsByCourse("MATH107"), ["2027 Spring"]);
});

test("keeps instructors empty for every offering", () => {
  const parsed = parseMathCourseOfferings(fixture);
  assert.ok(parsed.offerings.every(({ instructors }) => instructors.length === 0));
});

test("deduplicates repeated canonical course-and-term offerings", () => {
  const row = `
    <tr>
      <td>107/107L</td>
      <td>Duplicate source row</td>
      <td>&nbsp;</td>
      <td>&nbsp;</td>
      <td>S</td>
    </tr>`;
  const withDuplicate = fixture.replace(
    "<tr>\n            <td>112C</td>",
    `${row}\n          <tr>\n            <td>112C</td>`,
  );
  const parsed = parseMathCourseOfferings(withDuplicate);

  assert.equal(
    parsed.offerings.filter(
      ({ courseId, year, quarter }) =>
        courseId === "MATH107" && year === "2027" && quarter === "Spring",
    ).length,
    1,
  );
  assert.equal(
    parsed.offerings.filter(
      ({ courseId, year, quarter }) =>
        courseId === "MATH107L" && year === "2027" && quarter === "Spring",
    ).length,
    1,
  );
});

test("selects only future source terms using shared calendar metadata", () => {
  const parsed = parseMathCourseOfferings(fixture);
  const selected = selectImportableMathOfferings(
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

test("reports malformed nonempty availability cells so cleanup can be suppressed", () => {
  const malformed = fixture.replace(
    "<td>F</td>\n            <td>W</td>",
    "<td>Yes</td>\n            <td>W</td>",
  );
  const parsed = parseMathCourseOfferings(malformed);

  assert.ok(parsed.parsingErrors.some((error) => error.includes("availability 'YES'")));
});

test("reports a missing source section so a partial page cannot trigger cleanup", () => {
  const incomplete = fixture.replace(
    "Mathematics Upper-Division Course Offerings",
    "Incomplete Source Section",
  );
  const parsed = parseMathCourseOfferings(incomplete);

  assert.ok(parsed.parsingErrors.some((error) => error.includes("missing its Upper-Division")));
});
