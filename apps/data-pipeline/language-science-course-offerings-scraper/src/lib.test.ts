import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  normalizeLanguageScienceCourseId,
  parseLanguageScienceAcademicYear,
  parseLanguageScienceCourseOfferings,
  parseLanguageScienceTermHeader,
  resolveLanguageScienceInstructors,
  selectImportableLanguageScienceOfferings,
} from "./lib.ts";

const fixture = await readFile(
  join(dirname(fileURLToPath(import.meta.url)), "../test/fixtures/courses.html"),
  "utf8",
);

test("normalizes only canonical LSCI identifiers and preserves prefixes/suffixes", () => {
  assert.equal(normalizeLanguageScienceCourseId("LSCI 1"), "LSCI1");
  assert.equal(normalizeLanguageScienceCourseId("LSCI 107M"), "LSCI107M");
  assert.equal(normalizeLanguageScienceCourseId("LSCI 151C/LPS 145"), "LSCI151C");
  assert.equal(normalizeLanguageScienceCourseId("LSCI 195W"), "LSCI195W");
  assert.equal(normalizeLanguageScienceCourseId("LLSCI 145A/LPS 105A/PHIL 105A"), null);
  assert.equal(normalizeLanguageScienceCourseId("PSYCH 56L"), null);
  assert.equal(normalizeLanguageScienceCourseId("LSCI"), null);
});

test("extracts the current academic year and canonical term years", () => {
  assert.deepEqual(parseLanguageScienceAcademicYear(fixture), {
    academicYear: "2026-2027",
    startYear: 2026,
  });
  assert.deepEqual(
    parseLanguageScienceTermHeader("Fall 2026 Course Offerings", "2026-2027", 2026),
    {
      header: "Fall 2026 Course Offerings",
      academicYear: "2026-2027",
      year: "2026",
      quarter: "Fall",
    },
  );
  assert.deepEqual(
    parseLanguageScienceTermHeader("Winter 2027 Course Offerings", "2026-2027", 2026),
    {
      header: "Winter 2027 Course Offerings",
      academicYear: "2026-2027",
      year: "2027",
      quarter: "Winter",
    },
  );
  assert.equal(
    parseLanguageScienceTermHeader("Spring 2026 Course Offerings", "2026-2027", 2026),
    null,
  );
});

test("parses only current Fall/Winter/Spring sections and ignores Summer/history", () => {
  const parsed = parseLanguageScienceCourseOfferings(fixture);
  assert.equal(parsed.scheduleSectionsDiscovered, 3);
  assert.deepEqual(
    parsed.terms.map(({ year, quarter }) => `${year} ${quarter}`),
    ["2026 Fall", "2027 Winter", "2027 Spring"],
  );
  assert.deepEqual(parsed.offeringsByQuarter, { Fall: 11, Winter: 14, Spring: 11 });
  assert.equal(parsed.offerings.length, 36);
  assert.ok(parsed.parsingErrors.some((error) => error.includes("LLSCI 145A/LPS 105A/PHIL 105A")));
  assert.ok(parsed.offerings.every(({ courseId }) => courseId.startsWith("LSCI")));
});

test("keeps primary LSCI IDs while ignoring non-LSCI cross-list identifiers", () => {
  const parsed = parseLanguageScienceCourseOfferings(fixture);
  assert.ok(parsed.courseIds.includes("LSCI51"));
  assert.ok(parsed.courseIds.includes("LSCI165S"));
  assert.ok(parsed.courseIds.includes("LSCI169"));
  assert.equal(
    parsed.courseIds.some((id) => /PSYCH|LPS|PHIL|EAS|COGS|EDUC|ANTHRO/.test(id)),
    false,
  );
  assert.equal(parsed.courseIds.includes("LSCI269"), false);
});

test("parses explicit instructor names and preserves unknown placeholders", () => {
  const parsed = parseLanguageScienceCourseOfferings(fixture);
  assert.deepEqual(
    parsed.offerings.find(({ courseId, quarter }) => courseId === "LSCI2" && quarter === "Fall")
      ?.instructors,
    ["Mis, B."],
  );
  const withPlaceholder = fixture.replace("(Mis, B.) (satisfies VII.", "(TBD) (satisfies VII.");
  const placeholderParsed = parseLanguageScienceCourseOfferings(withPlaceholder);
  assert.deepEqual(
    placeholderParsed.offerings.find(
      ({ courseId, quarter }) => courseId === "LSCI2" && quarter === "Fall",
    )?.instructors,
    ["TBD"],
  );
  assert.ok(placeholderParsed.ignoredInstructorPlaceholders > 0);
  assert.equal(
    parsed.offerings.some(({ instructors }) =>
      instructors.includes("that is, the language family they belong to"),
    ),
    false,
  );
  assert.deepEqual(resolveLanguageScienceInstructors(["TBD"], []), [
    { status: "tbd", name: "TBD", ucinetid: null },
  ]);
});

test("resolves an unambiguous existing instructor record without inventing aliases", () => {
  assert.deepEqual(
    resolveLanguageScienceInstructors(
      ["Mis, B.", "Unknown Person"],
      [
        { ucinetid: "bmis", name: "Mis, Benjamin", department: "Language Science" },
        { ucinetid: "other", name: "Other Person", department: "Other" },
      ],
    ),
    [{ status: "assigned", name: "Mis, B.", ucinetid: "bmis" }],
  );
});

test("collapses repeated canonical course rows by term while retaining distinct terms", () => {
  const duplicate = fixture.replace(
    "</tbody>",
    "<tr><td>LSCI 2</td><td>DISCOVERING LANGUAGE (Mis, B.)</td></tr></tbody>",
  );
  const parsed = parseLanguageScienceCourseOfferings(duplicate);
  assert.ok(
    parsed.offerings.some(({ courseId, quarter }) => courseId === "LSCI2" && quarter === "Fall"),
  );
  assert.deepEqual(parsed.duplicateRowsCollapsedByQuarter, { Fall: 1, Winter: 1, Spring: 0 });
});

test("reports missing current sections and unexpected nonempty table fragments", () => {
  const noSpring = fixture.replace("Spring 2027 Course Offerings", "Spring 2026 Course Offerings");
  const parsed = parseLanguageScienceCourseOfferings(noSpring);
  assert.ok(parsed.parsingErrors.some((error) => error.includes("required Spring section")));
  const malformed = fixture.replace("<td>LSCI 2</td>", "<td>LSCI ???</td>");
  assert.ok(
    parseLanguageScienceCourseOfferings(malformed).parsingErrors.some((error) =>
      error.includes("malformed course identifier"),
    ),
  );
});

test("selects only future calendar terms", () => {
  const parsed = parseLanguageScienceCourseOfferings(fixture);
  const selected = selectImportableLanguageScienceOfferings(
    parsed,
    [
      { year: "2026", quarter: "Fall", instructionStart: new Date("2026-09-21T00:00:00Z") },
      { year: "2027", quarter: "Winter", instructionStart: new Date("2027-01-04T00:00:00Z") },
      { year: "2027", quarter: "Spring", instructionStart: new Date("2027-03-29T00:00:00Z") },
    ],
    new Date("2026-08-01T00:00:00Z"),
  );
  assert.equal(selected.offerings.length, parsed.offerings.length);
  const stale = selectImportableLanguageScienceOfferings(
    parsed,
    [{ year: "2026", quarter: "Fall", instructionStart: new Date("2026-01-01T00:00:00Z") }],
    new Date("2026-08-01T00:00:00Z"),
  );
  assert.equal(stale.offerings.length, 0);
  assert.ok(stale.skippedOrStaleTerms.some((term) => term.includes("term has begun")));
});
