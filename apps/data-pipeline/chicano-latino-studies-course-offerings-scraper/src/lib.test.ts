import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { load } from "cheerio";
import {
  normalizeChicanoLatinoCourseId,
  parseChicanoLatinoAcademicYear,
  parseChicanoLatinoCourseOfferings,
  parseChicanoLatinoInstructorNames,
  parseChicanoLatinoLastUpdated,
  parseChicanoLatinoSectionCaption,
  resolveChicanoLatinoInstructors,
  selectImportableChicanoLatinoOfferings,
} from "./lib.ts";

const fixture = await readFile(
  join(dirname(fileURLToPath(import.meta.url)), "../test/fixtures/courses.html"),
  "utf8",
);

test("normalizes the catalogue CHC/LAT department code without removing its slash", () => {
  assert.equal(normalizeChicanoLatinoCourseId("Chc/Lat 61"), "CHC/LAT61");
  assert.equal(normalizeChicanoLatinoCourseId("Chc / Lat 102W"), "CHC/LAT102W");
  assert.equal(normalizeChicanoLatinoCourseId("CHC/LAT 151B"), "CHC/LAT151B");
  assert.equal(normalizeChicanoLatinoCourseId("Chc/Lat H190CW"), "CHC/LATH190CW");
  assert.equal(normalizeChicanoLatinoCourseId("Pol Sci 61A"), null);
  assert.equal(normalizeChicanoLatinoCourseId("Chc/Lat"), null);
});

test("parses the academic year, update date, and quarter section captions", () => {
  assert.deepEqual(parseChicanoLatinoAcademicYear(fixture), {
    academicYear: "2026-2027",
    startYear: 2026,
  });
  assert.deepEqual(
    parseChicanoLatinoSectionCaption("FALL QUARTER 2026", {
      academicYear: "2026-2027",
      startYear: 2026,
    }),
    {
      header: "FALL QUARTER 2026",
      academicYear: "2026-2027",
      year: "2026",
      quarter: "Fall",
    },
  );
  assert.deepEqual(
    parseChicanoLatinoCourseOfferings(fixture).terms.map(
      ({ year, quarter }) => `${year} ${quarter}`,
    ),
    ["2026 Fall", "2027 Winter", "2027 Spring"],
  );
  assert.equal(
    parseChicanoLatinoLastUpdated("Last updated: July 16, 2026")?.toISOString(),
    "2026-07-16T00:00:00.000Z",
  );
});

test("discovers only the three undergraduate quarter tables and parses rows as offerings", () => {
  const parsed = parseChicanoLatinoCourseOfferings(fixture);
  assert.equal(parsed.scheduleTablesDiscovered, 3);
  assert.deepEqual(parsed.sourceRowsByQuarter, { Fall: 6, Winter: 7, Spring: 6 });
  assert.equal(parsed.normalizedRows, 19);
  assert.deepEqual(parsed.offeringsByQuarter, { Fall: 5, Winter: 6, Spring: 5 });
  assert.equal(parsed.uniqueOfferings, 16);
  assert.equal(parsed.uniqueCourseIds, 12);
  assert.deepEqual(parsed.parsingErrors, []);
  assert.equal(parsed.courseIds.includes("CHC/LAT221"), false);
  assert.equal(
    parsed.courseIds.some((id) => id.startsWith("POLSCI")),
    false,
  );
});

test("extracts one, multiple, hyphenated, same-as, and cross-list instructors", () => {
  assert.deepEqual(parseChicanoLatinoInstructorNames("Title (Casavantes Bradford) *On-line"), {
    names: ["Casavantes Bradford"],
    ignoredTbdTbaValues: 0,
    parsingError: null,
  });
  assert.deepEqual(parseChicanoLatinoInstructorNames("Title (DeSipio & Sanchez-Lopez)"), {
    names: ["DeSipio", "Sanchez-Lopez"],
    ignoredTbdTbaValues: 0,
    parsingError: null,
  });
  assert.deepEqual(
    parseChicanoLatinoInstructorNames("Title (Pichon-Riviere – same as Spanish 140) *On-Line"),
    { names: ["Pichon-Riviere"], ignoredTbdTbaValues: 0, parsingError: null },
  );
  assert.deepEqual(
    parseChicanoLatinoInstructorNames("Title (Nickerson - cross list w/ Educ 124)"),
    {
      names: ["Nickerson"],
      ignoredTbdTbaValues: 0,
      parsingError: null,
    },
  );
  assert.deepEqual(parseChicanoLatinoInstructorNames("Title (TBD - same as Pol Sci 61A)"), {
    names: [],
    ignoredTbdTbaValues: 1,
    parsingError: null,
  });
  assert.deepEqual(parseChicanoLatinoInstructorNames("Title (TBA – cross list w/ Educ 124)"), {
    names: [],
    ignoredTbdTbaValues: 1,
    parsingError: null,
  });
});

test("collapses repeated CHC/LAT 183 rows while retaining the same course in each quarter", () => {
  const parsed = parseChicanoLatinoCourseOfferings(fixture);
  assert.equal(parsed.duplicateRowsCollapsed, 3);
  assert.deepEqual(
    parsed.offerings
      .filter(({ courseId }) => courseId === "CHC/LAT183")
      .map(({ quarter }) => quarter),
    ["Fall", "Winter", "Spring"],
  );
  assert.deepEqual(
    parsed.offerings.find(
      ({ courseId, quarter }) => courseId === "CHC/LAT183" && quarter === "Fall",
    )?.instructors,
    ["Nickerson"],
  );
  assert.equal(parsed.parsedInstructorAssignments, 13);
  assert.equal(parsed.ignoredTbdTbaValues, 6);
});

test("resolves only unambiguous instructor records and preserves source spelling", () => {
  const resolved = resolveChicanoLatinoInstructors(
    ["Casavantes Bradford", "Pichon-Riviere", "Sanchez-Lopez", "Duncan"],
    [
      {
        ucinetid: "acasavan",
        name: "Anita Casavantes Bradford",
        department: "Chicano/Latino Studies",
      },
      { ucinetid: "pichonrm", name: "Rocio Pichon-riviere", department: "Spanish & Portuguese" },
      {
        ucinetid: "luises3",
        name: "Luis Eduardo Sanchez Lopez",
        department: "Chicano/Latino Studies",
      },
      {
        ucinetid: "rhduncan",
        name: "Robert Henry Duncan",
        department: "Global & International Studies",
      },
      { ucinetid: "gduncan", name: "Greg John Duncan", department: "Education" },
    ],
  );
  assert.deepEqual(resolved, [
    { status: "assigned", name: "Casavantes Bradford", ucinetid: "acasavan" },
    { status: "assigned", name: "Pichon-Riviere", ucinetid: "pichonrm" },
    { status: "assigned", name: "Sanchez-Lopez", ucinetid: "luises3" },
  ]);
});

test("reports malformed IDs, instructor metadata, blank rows, and empty required sections", () => {
  const $ = load(fixture);
  $("#fall tbody").append("<tr><td>Pol Sci 61A</td><td>Cross-listed only (Davies)</td></tr>");
  $("#fall tbody").append("<tr><td>Chc/Lat 65</td><td>Malformed (Unclosed</td></tr>");
  $("#fall tbody").append("<tr><td></td><td></td></tr>");
  const parsed = parseChicanoLatinoCourseOfferings($.html());
  assert.ok(parsed.parsingErrors.some((error) => error.includes("malformed course identifier")));
  assert.ok(parsed.parsingErrors.some((error) => error.includes("unbalanced instructor metadata")));
  assert.equal(parsed.courseIds.includes("POLSCI61A"), false);

  const missingQuarter = load(fixture);
  missingQuarter("#winter").remove();
  const missing = parseChicanoLatinoCourseOfferings(missingQuarter.html());
  assert.ok(missing.parsingErrors.some((error) => error.includes("missing its Winter")));

  const emptyQuarter = load(fixture);
  emptyQuarter("#spring tbody tr").remove();
  const empty = parseChicanoLatinoCourseOfferings(emptyQuarter.html());
  assert.ok(empty.parsingErrors.some((error) => error.includes("no usable Spring")));
});

test("reports missing headings and malformed update dates", () => {
  const noHeading = load(fixture);
  noHeading("h1").text("Course Offerings");
  const missing = parseChicanoLatinoCourseOfferings(noHeading.html());
  assert.equal(missing.academicYear, null);
  assert.ok(missing.parsingErrors.some((error) => error.includes("academic-year")));

  const badDate = load(fixture);
  badDate(".one p").first().text("Last updated: July 99, 2026");
  const parsed = parseChicanoLatinoCourseOfferings(badDate.html());
  assert.equal(parsed.lastUpdated, null);
  assert.ok(parsed.parsingErrors.some((error) => error.includes("Last updated value")));
});

test("selects only exact future terms using shared calendar metadata", () => {
  const parsed = parseChicanoLatinoCourseOfferings(fixture);
  const selected = selectImportableChicanoLatinoOfferings(
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
