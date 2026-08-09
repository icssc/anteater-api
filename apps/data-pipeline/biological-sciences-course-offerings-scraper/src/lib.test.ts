import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  normalizeBioCourseId,
  parseBioCourseOfferings,
  parseBioTermHeader,
  selectImportableBioOfferings,
  shouldCleanupBioSource,
} from "./lib.ts";

const fixture = await readFile(
  join(dirname(fileURLToPath(import.meta.url)), "../test/fixtures/course-offerings.html"),
  "utf8",
);

test("normalizes numeric and letter-prefixed BIO SCI course identifiers", () => {
  assert.equal(normalizeBioCourseId("BIO SCI 93"), "BIOSCI93");
  assert.equal(normalizeBioCourseId("BIOSCI93"), "BIOSCI93");
  assert.equal(normalizeBioCourseId("D103"), "BIOSCID103");
  assert.equal(normalizeBioCourseId("BIO SCI E106"), "BIOSCIE106");
  assert.equal(normalizeBioCourseId("N110"), "BIOSCIN110");
  assert.equal(normalizeBioCourseId("H90"), "BIOSCIH90");
  assert.equal(normalizeBioCourseId("2B"), "BIOSCI2B");
  assert.equal(normalizeBioCourseId("CHEM 1A"), null);
});

test("converts source quarter headers to canonical UCI terms and academic years", () => {
  assert.deepEqual(parseBioTermHeader("F26"), {
    header: "F26",
    academicYear: "2026-2027",
    year: "2026",
    quarter: "Fall",
  });
  assert.deepEqual(parseBioTermHeader("W27"), {
    header: "W27",
    academicYear: "2026-2027",
    year: "2027",
    quarter: "Winter",
  });
  assert.deepEqual(parseBioTermHeader("S27"), {
    header: "S27",
    academicYear: "2026-2027",
    year: "2027",
    quarter: "Spring",
  });
});

test("parses checked cells, ignores unchecked cells, and leaves instructors empty", () => {
  const parsed = parseBioCourseOfferings(fixture);
  const bio93 = parsed.offerings.filter(({ courseId }) => courseId === "BIOSCI93");

  assert.equal(parsed.rowsParsed, 11);
  assert.equal(parsed.offerings.length, 16);
  assert.deepEqual(bio93, [
    {
      academicYear: "2026-2027",
      courseId: "BIOSCI93",
      year: "2026",
      quarter: "Fall",
      instructors: [],
    },
  ]);
  assert.ok(parsed.offerings.every(({ instructors }) => instructors.length === 0));
  assert.equal(parsed.lastUpdated?.toISOString(), "2026-05-14T00:00:00.000Z");
  assert.deepEqual(parsed.parsingErrors, []);
});

test("parses letter-prefixed course numbers from the saved source fixture", () => {
  const parsed = parseBioCourseOfferings(fixture);
  const courseIds = new Set(parsed.offerings.map(({ courseId }) => courseId));

  assert.equal(courseIds.has("BIOSCID103"), true);
  assert.equal(courseIds.has("BIOSCIE106"), true);
  assert.equal(courseIds.has("BIOSCIN110"), true);
  assert.equal(courseIds.has("BIOSCIH90"), true);
});

test("preserves the older years shown by the Neurobiology and Behavior subsection", () => {
  const parsed = parseBioCourseOfferings(fixture);
  const neurobiology = parsed.sections.find(({ name }) => name === "Neurobiology & Behavior");

  assert.deepEqual(
    neurobiology?.terms.map(({ header, academicYear, year, quarter }) => ({
      header,
      academicYear,
      year,
      quarter,
    })),
    [
      { header: "F25", academicYear: "2025-2026", year: "2025", quarter: "Fall" },
      { header: "W26", academicYear: "2025-2026", year: "2026", quarter: "Winter" },
      { header: "S26", academicYear: "2025-2026", year: "2026", quarter: "Spring" },
    ],
  );
  assert.deepEqual(
    parsed.offerings
      .filter(({ courseId }) => courseId === "BIOSCIN115A" || courseId === "BIOSCIN115B")
      .map(({ courseId, academicYear, year, quarter }) => ({
        courseId,
        academicYear,
        year,
        quarter,
      })),
    [
      {
        courseId: "BIOSCIN115A",
        academicYear: "2025-2026",
        year: "2025",
        quarter: "Fall",
      },
      {
        courseId: "BIOSCIN115B",
        academicYear: "2025-2026",
        year: "2026",
        quarter: "Winter",
      },
    ],
  );
});

test("skips stale source terms using calendar metadata without rewriting their years", () => {
  const parsed = parseBioCourseOfferings(fixture);
  const selected = selectImportableBioOfferings(
    parsed,
    [
      { year: "2025", quarter: "Fall", instructionStart: new Date("2025-09-22") },
      { year: "2026", quarter: "Winter", instructionStart: new Date("2026-01-05") },
      { year: "2026", quarter: "Spring", instructionStart: new Date("2026-03-30") },
      { year: "2026", quarter: "Fall", instructionStart: new Date("2026-09-24") },
      { year: "2027", quarter: "Winter", instructionStart: new Date("2027-01-04") },
      { year: "2027", quarter: "Spring", instructionStart: new Date("2027-03-29") },
    ],
    new Date("2026-08-01"),
  );

  assert.equal(
    selected.offerings.some(({ academicYear }) => academicYear === "2025-2026"),
    false,
  );
  assert.deepEqual(selected.skippedOrStaleSections, [
    "Neurobiology & Behavior: skipped F25 (term has begun), W26 (term has begun), S26 (term has begun)",
  ]);
});

test("deduplicates repeated special-topics rows by canonical course and term", () => {
  const duplicate = `
    <tr>
      <td>2B – Duplicate Source Row</td>
      <td>✓</td>
      <td></td>
      <td></td>
    </tr>`;
  const withDuplicate = fixture.replace(
    '<tbody class="row-striping row-hover">',
    `<tbody class="row-striping row-hover">${duplicate}`,
  );
  const parsed = parseBioCourseOfferings(withDuplicate);

  assert.equal(
    parsed.offerings.filter(
      ({ courseId, year, quarter }) =>
        courseId === "BIOSCI2B" && year === "2026" && quarter === "Fall",
    ).length,
    1,
  );
  assert.deepEqual(
    parsed.offerings
      .filter(({ courseId }) => courseId === "BIOSCI2B")
      .map(({ year, quarter }) => `${year} ${quarter}`),
    ["2026 Fall", "2027 Winter"],
  );
});

test("a controlled malformed HTML marker disables cleanup", () => {
  const malformed = fixture.replace(
    '<td class="column-3"></td>',
    '<td class="column-3">unexpected marker</td>',
  );
  const parsed = parseBioCourseOfferings(malformed);

  assert.ok(parsed.parsingErrors.some((error) => error.includes("unexpected marker")));
  assert.equal(shouldCleanupBioSource(parsed), false);
});
