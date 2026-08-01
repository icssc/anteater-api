import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  normalizeGraduateChemistryCourseId,
  parseGraduateChemistryAcademicYear,
  parseGraduateChemistryCourseOfferings,
  parseGraduateChemistryInstructorCell,
  parseGraduateChemistryTermHeader,
  resolveGraduateChemistryInstructors,
  selectImportableGraduateChemistryOfferings,
} from "./lib.ts";

const fixture = await readFile(
  join(dirname(fileURLToPath(import.meta.url)), "../test/fixtures/course-offerings.html"),
  "utf8",
);

test("normalizes graduate numeric, letter-suffixed, and laboratory course numbers", () => {
  assert.equal(normalizeGraduateChemistryCourseId("200"), "CHEM200");
  assert.equal(normalizeGraduateChemistryCourseId("201"), "CHEM201");
  assert.equal(normalizeGraduateChemistryCourseId("250"), "CHEM250");
  assert.equal(normalizeGraduateChemistryCourseId("229A"), "CHEM229A");
  assert.equal(normalizeGraduateChemistryCourseId("231B"), "CHEM231B");
  assert.equal(normalizeGraduateChemistryCourseId("245C"), "CHEM245C");
  assert.equal(normalizeGraduateChemistryCourseId("250L"), "CHEM250L");
  assert.equal(normalizeGraduateChemistryCourseId("200/201"), null);
});

test("parses the academic year and explicit Fall, Winter, and Spring headings", () => {
  assert.deepEqual(parseGraduateChemistryAcademicYear(fixture), {
    academicYear: "2026-2027",
    startYear: 2026,
  });
  assert.deepEqual(parseGraduateChemistryTermHeader("FALL 2026", "2026-2027"), {
    header: "FALL 2026",
    academicYear: "2026-2027",
    year: "2026",
    quarter: "Fall",
  });
  assert.deepEqual(parseGraduateChemistryTermHeader("WINTER 2027", "2026-2027"), {
    header: "WINTER 2027",
    academicYear: "2026-2027",
    year: "2027",
    quarter: "Winter",
  });
  assert.deepEqual(parseGraduateChemistryTermHeader("SPRING 2027", "2026-2027"), {
    header: "SPRING 2027",
    academicYear: "2026-2027",
    year: "2027",
    quarter: "Spring",
  });
});

test("parses the current graduate listing and nullable source metadata", () => {
  const parsed = parseGraduateChemistryCourseOfferings(fixture);

  assert.equal(parsed.sourceRowsParsed, 44);
  assert.equal(parsed.normalizedCourseRows, 44);
  assert.equal(parsed.offerings.length, 44);
  assert.equal(parsed.instructorNamesParsed, 39);
  assert.equal(parsed.academicYear, "2026-2027");
  assert.equal(parsed.lastUpdated, null);
  assert.deepEqual(parsed.ignoredNonPersonPlaceholders, ["PharmSci", "Physics"]);
  assert.deepEqual(parsed.parsingErrors, []);
});

test("splits slash and comma lists, normalizes whitespace, deduplicates, and removes TBD", () => {
  assert.deepEqual(parseGraduateChemistryInstructorCell(" Mang / Prescher, Mang, TBD "), {
    instructors: ["Mang", "Prescher"],
    ignoredNonPersonPlaceholders: [],
  });
  assert.deepEqual(parseGraduateChemistryInstructorCell("TBD"), {
    instructors: [],
    ignoredNonPersonPlaceholders: [],
  });
});

test("separates non-person placeholders from unresolved person names", () => {
  assert.deepEqual(parseGraduateChemistryInstructorCell("Physics / PharmSci, Hanford"), {
    instructors: ["Hanford"],
    ignoredNonPersonPlaceholders: ["Physics", "PharmSci"],
  });

  const parsed = parseGraduateChemistryCourseOfferings(fixture);
  assert.deepEqual(
    parsed.offerings.find(
      ({ courseId, year, quarter }) =>
        courseId === "CHEM206" && year === "2026" && quarter === "Fall",
    )?.instructors,
    [],
  );
  assert.deepEqual(
    parsed.offerings.find(
      ({ courseId, year, quarter }) =>
        courseId === "CHEM223" && year === "2027" && quarter === "Spring",
    )?.instructors,
    [],
  );
});

test("does not correct or alias the source spelling Hanford", () => {
  const parsed = parseGraduateChemistryCourseOfferings(fixture);
  const sourceNames = parsed.offerings.find(({ courseId }) => courseId === "CHEM216")?.instructors;
  assert.deepEqual(sourceNames, ["Hanford"]);
  assert.deepEqual(
    resolveGraduateChemistryInstructors(sourceNames ?? [], [
      { ucinetid: "handford", name: "Handford", department: "Chemistry" },
    ]),
    [],
  );
});

test("keeps repeated courses separate across terms", () => {
  const parsed = parseGraduateChemistryCourseOfferings(fixture);

  assert.deepEqual(
    parsed.offerings
      .filter(({ courseId }) => courseId === "CHEM200")
      .map(({ year, quarter }) => `${year} ${quarter}`),
    ["2026 Fall", "2027 Spring"],
  );
  assert.deepEqual(
    parsed.offerings
      .filter(({ courseId }) => courseId === "CHEM223")
      .map(({ year, quarter }) => `${year} ${quarter}`),
    ["2026 Fall", "2027 Spring"],
  );
});

test("merges duplicate course-term rows and deduplicates their instructors", () => {
  const duplicate =
    "<tr><td>Chem</td><td>200</td><td>Duplicate</td><td>Mang, Murray, Mang</td></tr>";
  const withDuplicate = fixture.replace(
    /(<tr>\s*<td>Chem<\/td>\s*<td>201<\/td>)/,
    `${duplicate}$1`,
  );
  const parsed = parseGraduateChemistryCourseOfferings(withDuplicate);
  const offerings = parsed.offerings.filter(
    ({ courseId, year, quarter }) =>
      courseId === "CHEM200" && year === "2026" && quarter === "Fall",
  );

  assert.equal(offerings.length, 1);
  assert.deepEqual(offerings[0].instructors, ["Mang", "Prescher", "Murray"]);
});

test("ignores empty separator rows but reports malformed rows", () => {
  const malformed = fixture.replace(
    /(<tr>\s*<td><strong>WINTER 2027<\/strong><\/td>)/,
    "<tr><td>Chem</td><td></td><td>Malformed</td><td></td></tr>$1",
  );
  const parsed = parseGraduateChemistryCourseOfferings(malformed);

  assert.equal(parsed.sourceRowsParsed, 45);
  assert.ok(parsed.parsingErrors.some((error) => error.includes("unrecognized course identifier")));
});

test("reports incomplete and empty required quarter sections", () => {
  const missing = fixture.replace("SPRING 2027", "SUMMER 2027");
  const parsedMissing = parseGraduateChemistryCourseOfferings(missing);
  assert.ok(
    parsedMissing.parsingErrors.some((error) => error.includes("missing its Spring term heading")),
  );

  const empty = fixture.replace(
    /<tr>\s*<td><strong>SPRING 2027<\/strong><\/td>[\s\S]*?<\/tbody>/,
    "<tr><td><strong>SPRING 2027</strong></td><td></td><td></td><td></td></tr><tr><td>Department</td><td>Course Number</td><td>Course Name</td><td>Instructor(s)</td></tr></tbody>",
  );
  const parsedEmpty = parseGraduateChemistryCourseOfferings(empty);
  assert.ok(
    parsedEmpty.parsingErrors.some((error) => error.includes("no usable Spring course rows")),
  );
});

test("resolves only unambiguous existing instructors and preserves source spelling", () => {
  const resolved = resolveGraduateChemistryInstructors(
    ["Mang", "Prescher", "Unknown", "Mang"],
    [
      { ucinetid: "mang", name: "Mang", department: "Chemistry" },
      {
        ucinetid: "prescher",
        name: "Jennifer Prescher",
        department: "Chemistry",
      },
      {
        ucinetid: "otherprescher",
        name: "Paul Prescher",
        department: "English",
      },
    ],
  );

  assert.deepEqual(resolved, [
    { status: "assigned", name: "Mang", ucinetid: "mang" },
    { status: "assigned", name: "Prescher", ucinetid: "prescher" },
  ]);
});

test("selects only exact future source terms using calendar metadata", () => {
  const parsed = parseGraduateChemistryCourseOfferings(fixture);
  const selected = selectImportableGraduateChemistryOfferings(
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
  assert.deepEqual(selected.skippedOrStaleTerms, ["FALL 2026 (term has begun)"]);
});
