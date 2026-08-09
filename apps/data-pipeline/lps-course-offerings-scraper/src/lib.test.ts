import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  isLpsPlaceholderCourseId,
  normalizeLpsCourseId,
  parseLpsAcademicYear,
  parseLpsCourseOfferings,
  parseLpsInstructorNames,
} from "./lib.ts";

const fixture = await readFile(
  join(dirname(fileURLToPath(import.meta.url)), "../test/fixtures/courses.html"),
  "utf8",
);

test("normalizes LPS numeric, suffix, and honors course identifiers", () => {
  assert.equal(normalizeLpsCourseId("LPS 29"), "LPS29");
  assert.equal(normalizeLpsCourseId("LPS H123"), "LPSH123");
  assert.equal(normalizeLpsCourseId("LPS 105A"), "LPS105A");
  assert.equal(normalizeLpsCourseId("LPS 2??"), null);
  assert.equal(isLpsPlaceholderCourseId("LPS 2??"), true);
  assert.equal(isLpsPlaceholderCourseId("LPS 24?"), true);
  assert.equal(isLpsPlaceholderCourseId("LPS 2X?"), false);
});

test("extracts the explicit current academic year and all three planned terms", () => {
  assert.deepEqual(parseLpsAcademicYear(fixture), { academicYear: "2026-2027", startYear: 2026 });
  const parsed = parseLpsCourseOfferings(fixture);
  assert.deepEqual(
    parsed.terms.map(({ year, quarter }) => `${year} ${quarter}`),
    ["2026 Fall", "2027 Winter", "2027 Spring"],
  );
});

test("parses planned offerings, explicit instructors, duplicate special topics, and ignores historical Spring 2026", () => {
  const parsed = parseLpsCourseOfferings(fixture);
  assert.ok(
    parsed.offerings.some(({ courseId, quarter }) => courseId === "LPS29" && quarter === "Fall"),
  );
  assert.ok(
    parsed.offerings.some(({ courseId, quarter }) => courseId === "LPS19" && quarter === "Winter"),
  );
  assert.ok(
    parsed.offerings.some(({ courseId, quarter }) => courseId === "LPS244" && quarter === "Spring"),
  );
  assert.equal(
    parsed.offerings.filter(
      ({ courseId, quarter }) => courseId === "LPS241" && quarter === "Winter",
    ).length,
    1,
  );
  assert.deepEqual(parseLpsInstructorNames("PPE III (Barrett & Skyrms)"), ["Barrett", "Skyrms"]);
  assert.deepEqual(parseLpsInstructorNames("Philosophy of Race (Heis) [LIFTED only]"), ["Heis"]);
  assert.equal(parsed.courseIds.includes("LPS2??"), false);
  assert.deepEqual(parsed.skippedPlaceholders, ["LPS 24?", "LPS 2??"]);
  assert.deepEqual(parsed.parsingErrors, []);
});

test("keeps TBD instructors unknown and skips deliberate partial-number placeholders", () => {
  const parsed = parseLpsCourseOfferings(fixture);
  assert.ok(
    parsed.offerings.some(
      ({ courseId, instructors }) => courseId === "LPS29" && instructors.length === 0,
    ),
  );
  assert.deepEqual(parsed.skippedPlaceholders, ["LPS 24?", "LPS 2??"]);
  assert.deepEqual(parsed.parsingErrors, []);
});

test("keeps genuinely ambiguous identifiers as parsing errors", () => {
  const parsed = parseLpsCourseOfferings(fixture.replace("LPS 2??", "LPS 2X?"));
  assert.ok(parsed.parsingErrors.some((error) => error.includes("LPS 2X?")));
});
