import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { load } from "cheerio";
import {
  normalizeGlobalStudiesCourseId,
  parseGlobalStudiesAcademicYear,
  parseGlobalStudiesCourseOfferings,
  parseGlobalStudiesInstructor,
  parseGlobalStudiesLastUpdated,
  parseGlobalStudiesTermHeader,
  resolveGlobalStudiesInstructors,
} from "./lib.ts";

const fixture = await readFile(
  join(dirname(fileURLToPath(import.meta.url)), "../test/fixtures/courses.html"),
  "utf8",
);

test("normalizes Global Studies course IDs and preserves suffixes", () => {
  assert.equal(normalizeGlobalStudiesCourseId("INTL ST 104BW"), "INTLST104BW");
  assert.equal(normalizeGlobalStudiesCourseId("intl st H180"), "INTLSTH180");
  assert.equal(normalizeGlobalStudiesCourseId("INTL ST 177C"), "INTLST177C");
  assert.equal(normalizeGlobalStudiesCourseId("POL SCI 45A"), null);
});

test("parses academic year, date, and explicit quarter years", () => {
  assert.deepEqual(parseGlobalStudiesAcademicYear(fixture), {
    academicYear: "2026-2027",
    startYear: 2026,
  });
  assert.equal(parseGlobalStudiesLastUpdated(fixture)?.toISOString(), "2026-07-22T00:00:00.000Z");
  assert.deepEqual(
    parseGlobalStudiesTermHeader("Spring 2027", { academicYear: "2026-2027", startYear: 2026 }),
    { header: "Spring 2027", academicYear: "2026-2027", year: "2027", quarter: "Spring" },
  );
  assert.equal(
    parseGlobalStudiesTermHeader("Spring 2026", { academicYear: "2026-2027", startYear: 2026 }),
    null,
  );
});

test("parses only undergraduate labeled blocks, deduplicates 179/189, and keeps source instructors", () => {
  const parsed = parseGlobalStudiesCourseOfferings(fixture);
  assert.equal(parsed.scheduleSectionsDiscovered, 3);
  assert.deepEqual(parsed.sourceBlocksByQuarter, { Fall: 7, Winter: 5, Spring: 5 });
  assert.equal(parsed.normalizedBlocks, 17);
  assert.deepEqual(parsed.offeringsByQuarter, { Fall: 6, Winter: 3, Spring: 5 });
  assert.equal(parsed.uniqueOfferings, 14);
  assert.equal(parsed.duplicate179BlocksCollapsed, 2);
  assert.equal(parsed.duplicate189BlocksCollapsed, 1);
  assert.deepEqual(
    parsed.offerings.find((o) => o.courseId === "INTLST179" && o.quarter === "Fall")?.instructors,
    ["Robert Duncan", "R. Duncan"],
  );
  assert.equal(parsed.courseIds.includes("INTLST999"), false);
  assert.deepEqual(parsed.parsingErrors, []);
});

test("does not infer instructors from descriptions and ignores TBA/TBD", () => {
  assert.deepEqual(parseGlobalStudiesInstructor("TBA"), { names: [], ignored: 1 });
  assert.deepEqual(parseGlobalStudiesInstructor("Bojan Petrovic"), {
    names: ["Bojan Petrovic"],
    ignored: 0,
  });
  assert.deepEqual(parseGlobalStudiesInstructor("Anne-Marie O'Neil"), {
    names: ["Anne-Marie O'Neil"],
    ignored: 0,
  });
  const parsed = parseGlobalStudiesCourseOfferings(fixture);
  assert.equal(parsed.ignoredTbdTbaValues, 3);
  assert.equal(parsed.parsedInstructorAssignments, 14);
});

test("allows an empty Description value when its label is present", () => {
  const $ = load(fixture);
  $("h2")
    .first()
    .nextAll("table")
    .first()
    .find("tbody")
    .append(
      "<tr><td><p><strong>Course Number</strong><br>INTL ST 190</p><p><strong>Course Title</strong><br>Independent Study</p><p><strong>Instructor</strong><br>Alex Example</p><p><strong>Description</strong><br></p></td></tr>",
    );
  const parsed = parseGlobalStudiesCourseOfferings($.html());
  assert.equal(
    parsed.offerings.some((offering) => offering.courseId === "INTLST190"),
    true,
  );
  assert.deepEqual(parsed.parsingErrors, []);
});

test("resolves only unambiguous known instructors", () => {
  assert.deepEqual(
    resolveGlobalStudiesInstructors(
      ["Duncan"],
      [
        {
          ucinetid: "rhduncan",
          name: "Robert Henry Duncan",
          department: "Global & International Studies",
        },
        { ucinetid: "gduncan", name: "Greg John Duncan", department: "Education" },
      ],
    ),
    [{ status: "assigned", name: "Duncan", ucinetid: "rhduncan" }],
  );
});

test("reports malformed or incomplete blocks and disables clean parsing", () => {
  const $ = load(fixture);
  $("h2")
    .first()
    .nextAll("table")
    .first()
    .find("tbody")
    .append(
      "<tr><td><p><strong>Course Number</strong><br>POL SCI 45A</p><p><strong>Course Title</strong><br>Bad</p><p><strong>Instructor</strong><br>TBA</p></td></tr>",
    );
  const parsed = parseGlobalStudiesCourseOfferings($.html());
  assert.ok(parsed.parsingErrors.some((error) => error.includes("missing description label")));
  const missing = load(fixture);
  missing("h2").first().remove();
  assert.ok(
    parseGlobalStudiesCourseOfferings(missing.html()).parsingErrors.some((error) =>
      error.includes("missing its Fall"),
    ),
  );
});
