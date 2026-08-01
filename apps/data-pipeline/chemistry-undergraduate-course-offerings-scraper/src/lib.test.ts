import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  normalizeChemistryCourseId,
  parseChemistryAcademicYear,
  parseChemistryCourseOfferings,
  parseChemistryInstructorNames,
  parseChemistryTermHeader,
  resolveChemistryInstructors,
  selectImportableChemistryOfferings,
} from "./lib.ts";

const fixture = await readFile(
  join(dirname(fileURLToPath(import.meta.url)), "../test/fixtures/course-offerings.html"),
  "utf8",
);

test("normalizes every Chemistry course-number shape without semantic aliases", () => {
  assert.equal(normalizeChemistryCourseId("5"), "CHEM5");
  assert.equal(normalizeChemistryCourseId("11"), "CHEM11");
  assert.equal(normalizeChemistryCourseId("100"), "CHEM100");
  assert.equal(normalizeChemistryCourseId("152"), "CHEM152");
  assert.equal(normalizeChemistryCourseId("1A"), "CHEM1A");
  assert.equal(normalizeChemistryCourseId("51LB"), "CHEM51LB");
  assert.equal(normalizeChemistryCourseId("100S"), "CHEM100S");
  assert.equal(normalizeChemistryCourseId("101W"), "CHEM101W");
  assert.equal(normalizeChemistryCourseId("133L"), "CHEM133L");
  assert.equal(normalizeChemistryCourseId("M2A"), "CHEMM2A");
  assert.equal(normalizeChemistryCourseId("M3LC"), "CHEMM3LC");
  assert.equal(normalizeChemistryCourseId("H180A"), "CHEMH180A");
  assert.equal(normalizeChemistryCourseId("M2LA"), "CHEMM2LA");
  assert.equal(normalizeChemistryCourseId("M52LB"), "CHEMM52LB");
  assert.equal(normalizeChemistryCourseId("H181W"), "CHEMH181W");
  assert.equal(normalizeChemistryCourseId("1A*"), "CHEM1A");
  assert.equal(normalizeChemistryCourseId("M52L A"), "CHEMM52LA");
  assert.equal(normalizeChemistryCourseId("M52LA"), "CHEMM52LA");
  assert.equal(normalizeChemistryCourseId("1A/1B"), null);
});

test("parses the page academic year and explicit Fall, Winter, and Spring headers", () => {
  assert.deepEqual(parseChemistryAcademicYear(fixture), {
    academicYear: "2026-2027",
    startYear: 2026,
  });
  assert.deepEqual(parseChemistryTermHeader("FALL 2026", "2026-2027"), {
    header: "FALL 2026",
    academicYear: "2026-2027",
    year: "2026",
    quarter: "Fall",
  });
  assert.deepEqual(parseChemistryTermHeader("WINTER 2027", "2026-2027"), {
    header: "WINTER 2027",
    academicYear: "2026-2027",
    year: "2027",
    quarter: "Winter",
  });
  assert.deepEqual(parseChemistryTermHeader("SPRING 2027", "2026-2027"), {
    header: "SPRING 2027",
    academicYear: "2026-2027",
    year: "2027",
    quarter: "Spring",
  });
});

test("parses representative rows, nullable metadata, and empty instructors", () => {
  const parsed = parseChemistryCourseOfferings(fixture);

  assert.equal(parsed.sourceRowsParsed, 26);
  assert.equal(parsed.normalizedCourseRows, 26);
  assert.equal(parsed.offerings.length, 23);
  assert.equal(parsed.instructorNamesParsed, 29);
  assert.equal(parsed.academicYear, "2026-2027");
  assert.equal(parsed.lastUpdated, null);
  assert.deepEqual(parsed.parsingErrors, []);
  assert.deepEqual(
    parsed.offerings.find(({ courseId }) => courseId === "CHEM177")?.instructors,
    [],
  );
});

test("merges starred and unstarred duplicates by canonical course and term", () => {
  const parsed = parseChemistryCourseOfferings(fixture);

  assert.deepEqual(
    parsed.offerings.find(
      ({ courseId, year, quarter }) =>
        courseId === "CHEM1A" && year === "2026" && quarter === "Fall",
    )?.instructors,
    ["Borovik", "Ge", "Holton"],
  );
  assert.deepEqual(
    parsed.offerings.find(
      ({ courseId, year, quarter }) =>
        courseId === "CHEM1B" && year === "2027" && quarter === "Winter",
    )?.instructors,
    ["Borovik", "Holton"],
  );
  assert.deepEqual(
    parsed.offerings.find(
      ({ courseId, year, quarter }) =>
        courseId === "CHEM1C" && year === "2027" && quarter === "Spring",
    )?.instructors,
    ["Borovik", "Mandelshtam", "Shaka", "Holton"],
  );
});

test("normalizes M52L A as one majors course without expansion", () => {
  const parsed = parseChemistryCourseOfferings(fixture);
  const offerings = parsed.offerings.filter(
    ({ courseId, year, quarter }) =>
      courseId === "CHEMM52LA" && year === "2026" && quarter === "Fall",
  );

  assert.equal(offerings.length, 1);
  assert.deepEqual(offerings[0].instructors, ["King"]);
  assert.equal(parsed.courseIds.includes("CHEMH52LA"), false);
});

test("splits comma and slash lists, removes duplicates, and excludes TBD values", () => {
  assert.deepEqual(
    parseChemistryInstructorNames(" Jarvo, King / Sim, Jarvo, TBD, Pharm Sci. Instructor - TBD "),
    ["Jarvo", "King", "Sim"],
  );
  assert.deepEqual(parseChemistryInstructorNames("TBD"), []);
  assert.deepEqual(parseChemistryInstructorNames("Borovik, TBD"), ["Borovik"]);
});

test("keeps repeated courses separate across terms", () => {
  const parsed = parseChemistryCourseOfferings(fixture);

  assert.deepEqual(
    parsed.offerings
      .filter(({ courseId }) => courseId === "CHEMM3LC")
      .map(({ year, quarter }) => `${year} ${quarter}`),
    ["2026 Fall", "2027 Spring"],
  );
});

test("deduplicates repeated normalized course-term rows and merges their instructors", () => {
  const duplicate =
    "<tr><td>Chem</td><td>M2A</td><td></td><td>Duplicate</td><td>Sheldon, Edwards</td></tr>";
  const withDuplicate = fixture.replace(
    "<tr>\n            <td>Chem</td>\n            <td>M2LA</td>",
    `${duplicate}<tr>\n            <td>Chem</td>\n            <td>M2LA</td>`,
  );
  const parsed = parseChemistryCourseOfferings(withDuplicate);
  const offerings = parsed.offerings.filter(
    ({ courseId, year, quarter }) =>
      courseId === "CHEMM2A" && year === "2026" && quarter === "Fall",
  );

  assert.equal(offerings.length, 1);
  assert.deepEqual(offerings[0].instructors, ["Shiraiwa", "Sheldon", "Edwards"]);
});

test("ignores empty rows but reports malformed rows and incomplete term sections", () => {
  const malformed = fixture.replace(
    "<tr>\n            <td><strong>WINTER 2027</strong></td>",
    "<tr><td>Chem</td><td></td><td></td><td>Malformed</td><td></td></tr><tr>\n            <td><strong>WINTER 2027</strong></td>",
  );
  const parsedMalformed = parseChemistryCourseOfferings(malformed);
  assert.ok(
    parsedMalformed.parsingErrors.some((error) => error.includes("unrecognized course identifier")),
  );

  const incomplete = fixture.replace("SPRING 2027", "SUMMER 2027");
  const parsedIncomplete = parseChemistryCourseOfferings(incomplete);
  assert.ok(
    parsedIncomplete.parsingErrors.some((error) => error.includes("missing its Spring term")),
  );
});

test("resolves only unambiguous existing instructors and preserves source spelling", () => {
  const resolved = resolveChemistryInstructors(
    ["King", "Borovik", "Unknown", "King"],
    [
      { ucinetid: "s3king", name: "Susan King", department: "Chemistry" },
      { ucinetid: "lking", name: "Linda King", department: "English" },
      { ucinetid: "aborovik", name: "Andrew Borovik", department: "Chemistry" },
    ],
  );

  assert.deepEqual(resolved, [
    { status: "assigned", name: "King", ucinetid: "s3king" },
    { status: "assigned", name: "Borovik", ucinetid: "aborovik" },
  ]);
});

test("selects exact future source terms using calendar metadata", () => {
  const parsed = parseChemistryCourseOfferings(fixture);
  const selected = selectImportableChemistryOfferings(
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
  assert.deepEqual(selected.skippedOrStaleTerms, ["FALL 2026 (term has begun)"]);
});
