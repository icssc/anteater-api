import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  normalizeEarthSystemScienceCourseId,
  parseEarthSystemScienceAcademicYear,
  parseEarthSystemScienceCourseOfferings,
  parseEarthSystemScienceInstructorNames,
  parseEarthSystemScienceTermHeader,
  resolveEarthSystemScienceInstructors,
  selectImportableEarthSystemScienceOfferings,
} from "./lib.ts";

const fixture = await readFile(
  join(dirname(fileURLToPath(import.meta.url)), "../test/fixtures/course-offerings.html"),
  "utf8",
);

test("normalizes mixed-case EarthSS numeric, suffix, writing, and graduate course IDs", () => {
  assert.equal(normalizeEarthSystemScienceCourseId("EarthSS 1"), "EARTHSS1");
  assert.equal(normalizeEarthSystemScienceCourseId("earthss 15"), "EARTHSS15");
  assert.equal(normalizeEarthSystemScienceCourseId("EARTHSS40C"), "EARTHSS40C");
  assert.equal(normalizeEarthSystemScienceCourseId("EarthSS 135W"), "EARTHSS135W");
  assert.equal(normalizeEarthSystemScienceCourseId("EarthSS 177W"), "EARTHSS177W");
  assert.equal(normalizeEarthSystemScienceCourseId("EarthSS 200"), "EARTHSS200");
  assert.equal(normalizeEarthSystemScienceCourseId("EarthSS 298"), "EARTHSS298");
  assert.equal(normalizeEarthSystemScienceCourseId("ESS 1"), null);
  assert.equal(normalizeEarthSystemScienceCourseId("EarthSS 1/2"), null);
});

test("extracts the academic year and explicit Fall, Winter, and Spring table terms", () => {
  assert.deepEqual(parseEarthSystemScienceAcademicYear(fixture), {
    academicYear: "2026-2027",
    startYear: 2026,
  });
  assert.deepEqual(parseEarthSystemScienceTermHeader("Fall 2026", "2026-2027"), {
    header: "Fall 2026",
    academicYear: "2026-2027",
    year: "2026",
    quarter: "Fall",
  });
  assert.deepEqual(parseEarthSystemScienceTermHeader("Winter 2027", "2026-2027"), {
    header: "Winter 2027",
    academicYear: "2026-2027",
    year: "2027",
    quarter: "Winter",
  });
  assert.deepEqual(parseEarthSystemScienceTermHeader("Spring 2027", "2026-2027"), {
    header: "Spring 2027",
    academicYear: "2026-2027",
    year: "2027",
    quarter: "Spring",
  });
});

test("parses all current term tables, course levels, instructors, and nullable metadata", () => {
  const parsed = parseEarthSystemScienceCourseOfferings(fixture);

  assert.equal(parsed.sourceRowsParsed, 50);
  assert.equal(parsed.normalizedCourseRows, 50);
  assert.equal(parsed.offerings.length, 50);
  assert.equal(parsed.courseIds.length, 47);
  assert.equal(parsed.parsedInstructorAssignments, 48);
  assert.equal(parsed.academicYear, "2026-2027");
  assert.equal(parsed.lastUpdated, null);
  assert.deepEqual(parsed.parsingErrors, []);
  assert.ok(parsed.courseIds.includes("EARTHSS200"));
  assert.ok(parsed.courseIds.includes("EARTHSS298"));
});

test("keeps Last, First names intact, preserves hyphens, deduplicates, and removes TBD", () => {
  assert.deepEqual(parseEarthSystemScienceInstructorNames("Ferguson, Julie"), ["Ferguson, Julie"]);
  assert.deepEqual(parseEarthSystemScienceInstructorNames("Yu, Jin-Yi"), ["Yu, Jin-Yi"]);
  assert.deepEqual(
    parseEarthSystemScienceInstructorNames("Ferguson, Julie / Yu, Jin-Yi; Ferguson,   Julie"),
    ["Ferguson, Julie", "Yu, Jin-Yi"],
  );
  assert.deepEqual(parseEarthSystemScienceInstructorNames("TBD"), []);
});

test("treats title parentheticals only as text and keeps repeated courses term-specific", () => {
  const parsed = parseEarthSystemScienceCourseOfferings(fixture);
  assert.deepEqual(
    parsed.offerings
      .filter(({ courseId }) => courseId === "EARTHSS15")
      .map(({ year, quarter }) => `${year} ${quarter}`),
    ["2026 Fall", "2027 Winter"],
  );
  assert.deepEqual(
    parsed.offerings
      .filter(({ courseId }) => courseId === "EARTHSS132")
      .map(({ year, quarter }) => `${year} ${quarter}`),
    ["2026 Fall", "2027 Winter"],
  );
  assert.deepEqual(
    parsed.offerings
      .filter(({ courseId }) => courseId === "EARTHSS116")
      .map(({ year, quarter }) => `${year} ${quarter}`),
    ["2026 Fall", "2027 Spring"],
  );
  assert.ok(parsed.courseIds.includes("EARTHSS234"));
});

test("merges only duplicate canonical course-term rows and deduplicates instructors", () => {
  const duplicate =
    "<tr><td>earthss 1</td><td>Duplicate title</td><td>Ferguson, Julie / Moore, Keith</td></tr>";
  const withDuplicate = fixture.replace(/(<tr>\s*<td>EarthSS 2<\/td>)/, `${duplicate}$1`);
  const parsed = parseEarthSystemScienceCourseOfferings(withDuplicate);
  const offerings = parsed.offerings.filter(
    ({ courseId, year, quarter }) =>
      courseId === "EARTHSS1" && year === "2026" && quarter === "Fall",
  );

  assert.equal(parsed.sourceRowsParsed, 51);
  assert.equal(parsed.normalizedCourseRows, 51);
  assert.equal(parsed.offerings.length, 50);
  assert.equal(offerings.length, 1);
  assert.deepEqual(offerings[0].instructors, ["Ferguson, Julie", "Moore, Keith"]);
});

test("ignores fully empty rows and reports malformed nonempty rows", () => {
  const malformed = fixture.replace(
    /(<thead>\s*<tr>\s*<th>Winter 2027<\/th>)/,
    "<tr><td></td><td>Malformed</td><td></td></tr>$1",
  );
  const parsed = parseEarthSystemScienceCourseOfferings(malformed);

  assert.equal(parsed.sourceRowsParsed, 51);
  assert.ok(parsed.parsingErrors.some((error) => error.includes("unrecognized course identifier")));
});

test("reports missing and empty required term tables", () => {
  const missing = fixture.replace(
    /<table class="table uk-table uk-table-striped">\s*<thead>\s*<tr>\s*<th>Spring 2027[\s\S]*?<\/table>/,
    "",
  );
  const parsedMissing = parseEarthSystemScienceCourseOfferings(missing);
  assert.ok(
    parsedMissing.parsingErrors.some((error) => error.includes("missing its Spring table")),
  );

  const empty = fixture.replace(
    /(<th>Spring 2027<\/th>[\s\S]*?<tbody>)[\s\S]*?(<\/tbody>)/,
    "$1$2",
  );
  const parsedEmpty = parseEarthSystemScienceCourseOfferings(empty);
  assert.ok(
    parsedEmpty.parsingErrors.some((error) => error.includes("no usable Spring course rows")),
  );
});

test("resolves only unambiguous exact or reordered names without nickname aliases", () => {
  const known = [
    {
      ucinetid: "jferguson",
      name: "Julie E. Ferguson",
      department: "Earth System Science",
    },
    { ucinetid: "jyyu", name: "Jin-Yi Yu", department: "Earth System Science" },
    {
      ucinetid: "mgoulden",
      name: "Michael Goulden",
      department: "Earth System Science",
    },
    { ucinetid: "other", name: "Julie Ferguson", department: "English" },
  ];

  assert.deepEqual(
    resolveEarthSystemScienceInstructors(["Ferguson, Julie", "Yu, Jin-Yi", "Goulden, Mike"], known),
    [
      { status: "assigned", name: "Ferguson, Julie", ucinetid: "jferguson" },
      { status: "assigned", name: "Yu, Jin-Yi", ucinetid: "jyyu" },
    ],
  );
});

test("does not resolve an ambiguous instructor name", () => {
  assert.deepEqual(
    resolveEarthSystemScienceInstructors(
      ["Ferguson, Julie"],
      [
        {
          ucinetid: "one",
          name: "Julie A. Ferguson",
          department: "Earth System Science",
        },
        {
          ucinetid: "two",
          name: "Julie B. Ferguson",
          department: "Earth System Science",
        },
      ],
    ),
    [],
  );
});

test("selects only exact future terms using calendar metadata", () => {
  const parsed = parseEarthSystemScienceCourseOfferings(fixture);
  const selected = selectImportableEarthSystemScienceOfferings(
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
  assert.deepEqual(selected.skippedOrStaleTerms, ["Fall 2026 (term has begun)"]);
});
