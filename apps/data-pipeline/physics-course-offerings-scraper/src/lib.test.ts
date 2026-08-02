import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { load } from "cheerio";
import {
  normalizePhysicsCourseId,
  parsePhysicsAcademicYear,
  parsePhysicsCourseOfferings,
  parsePhysicsTermHeader,
  selectImportablePhysicsOfferings,
} from "./lib.ts";

const fixture = await readFile(
  join(dirname(fileURLToPath(import.meta.url)), "../test/fixtures/course-info.html"),
  "utf8",
);

test("strips only the source P presentation prefix before numeric course numbers", () => {
  assert.equal(normalizePhysicsCourseId("P2"), "PHYSICS2");
  assert.equal(normalizePhysicsCourseId("P3A"), "PHYSICS3A");
  assert.equal(normalizePhysicsCourseId("P7LC"), "PHYSICS7LC");
  assert.equal(normalizePhysicsCourseId("P106W"), "PHYSICS106W");
  assert.equal(normalizePhysicsCourseId("P215B"), "PHYSICS215B");
  assert.equal(normalizePhysicsCourseId("P235C"), "PHYSICS235C");
  assert.equal(normalizePhysicsCourseId("P 007LC"), "PHYSICS7LC");
  assert.equal(normalizePhysicsCourseId("PP2"), null);
  assert.equal(normalizePhysicsCourseId("PH80"), null);
  assert.equal(normalizePhysicsCourseId("PHYSICS 2"), null);
});

test("preserves legitimate honors-prefix course numbers", () => {
  assert.equal(normalizePhysicsCourseId("H80"), "PHYSICSH80");
  assert.equal(normalizePhysicsCourseId("H90"), "PHYSICSH90");
});

test("extracts the academic year and explicit Fall, Winter, and Spring terms", () => {
  assert.deepEqual(parsePhysicsAcademicYear(fixture), {
    academicYear: "2026-2027",
    startYear: 2026,
  });
  assert.deepEqual(parsePhysicsTermHeader("Winter 2027", "2026-2027"), {
    header: "Winter 2027",
    academicYear: "2026-2027",
    year: "2027",
    quarter: "Winter",
  });

  const parsed = parsePhysicsCourseOfferings(fixture);
  assert.deepEqual(
    parsed.terms.map(({ year, quarter }) => `${year} ${quarter}`),
    ["2026 Fall", "2027 Winter", "2027 Spring"],
  );
});

test("parses lower, upper, laboratory, writing, honors, and graduate rows", () => {
  const parsed = parsePhysicsCourseOfferings(fixture);
  assert.equal(parsed.sourceTableRows, 21);
  assert.equal(parsed.normalizedCourseRows, 21);
  assert.equal(parsed.courseIds.length, 21);
  assert.deepEqual(parsed.offeringsByQuarter, { Fall: 9, Winter: 10, Spring: 13 });
  assert.equal(parsed.offerings.length, 32);
  assert.equal(parsed.duplicateRowsCollapsed, 0);
  assert.ok(parsed.courseIds.includes("PHYSICS2"));
  assert.ok(parsed.courseIds.includes("PHYSICS3A"));
  assert.ok(parsed.courseIds.includes("PHYSICS3LB"));
  assert.ok(parsed.courseIds.includes("PHYSICS7LC"));
  assert.ok(parsed.courseIds.includes("PHYSICS106W"));
  assert.ok(parsed.courseIds.includes("PHYSICSH80"));
  assert.ok(parsed.courseIds.includes("PHYSICSH90"));
  assert.ok(parsed.courseIds.includes("PHYSICS215B"));
  assert.ok(parsed.courseIds.includes("PHYSICS235C"));
  assert.deepEqual(parsed.parsingErrors, []);
});

test("creates Fall-only, Winter-only, Spring-only, all-term, and nonconsecutive offerings", () => {
  const parsed = parsePhysicsCourseOfferings(fixture);
  const quartersFor = (courseId: string) =>
    parsed.offerings
      .filter((offering) => offering.courseId === courseId)
      .map(({ quarter }) => quarter);

  assert.deepEqual(quartersFor("PHYSICS2"), ["Fall"]);
  assert.deepEqual(quartersFor("PHYSICSH90"), ["Winter"]);
  assert.deepEqual(quartersFor("PHYSICS106W"), ["Spring"]);
  assert.deepEqual(quartersFor("PHYSICS3A"), ["Fall", "Winter", "Spring"]);
  assert.deepEqual(quartersFor("PHYSICS206"), ["Fall", "Spring"]);
  assert.deepEqual(quartersFor("PHYSICS14"), []);
});

test("accepts only the exact marker expected for each quarter", () => {
  const $ = load(fixture);
  const firstRow = $("table").first().find("tbody tr").first();
  firstRow.children("td").eq(1).text("W");
  firstRow.children("td").eq(2).text("w");
  const parsed = parsePhysicsCourseOfferings($.html());

  assert.ok(
    parsed.parsingErrors.some((error) => error.includes("Fall cell has unexpected marker 'W'")),
  );
  assert.ok(
    parsed.parsingErrors.some((error) => error.includes("Winter cell has unexpected marker 'w'")),
  );
  assert.equal(
    parsed.offerings.some(({ courseId, quarter }) => courseId === "PHYSICS2" && quarter === "Fall"),
    false,
  );
});

test("uses quarter markers only and does not suppress titles containing pending", () => {
  const parsed = parsePhysicsCourseOfferings(fixture);
  assert.ok(
    parsed.offerings.some(
      ({ courseId, quarter }) => courseId === "PHYSICS235C" && quarter === "Winter",
    ),
  );

  const $ = load(fixture);
  $("table").first().find("tbody tr").eq(6).children("td").eq(0).text("Fall seminar (tentative)");
  const withTitleOnly = parsePhysicsCourseOfferings($.html());
  assert.equal(
    withTitleOnly.offerings.some(({ courseId }) => courseId === "PHYSICS14"),
    false,
  );
});

test("ignores FAQ, GE, historical, and Summer text outside the table", () => {
  const parsed = parsePhysicsCourseOfferings(fixture);
  assert.equal(parsed.courseIds.includes("PHYSICS12"), false);
  assert.equal(parsed.courseIds.includes("PHYSICS20C"), false);
  assert.equal(parsed.courseIds.includes("PHYSICS7D"), false);
  assert.equal(
    parsed.offerings.some(({ quarter }) => quarter === ("Summer" as never)),
    false,
  );
});

test("deduplicates repeated canonical course-term rows", () => {
  const $ = load(fixture);
  $("table")
    .first()
    .find("tbody")
    .append(
      "<tr><th scope='row'>P3A</th><td>Duplicate topic</td><td>F</td><td>W</td><td>S</td></tr>",
    );
  const parsed = parsePhysicsCourseOfferings($.html());
  assert.equal(parsed.sourceTableRows, 22);
  assert.equal(parsed.normalizedCourseRows, 22);
  assert.equal(parsed.offerings.length, 32);
  assert.equal(parsed.duplicateRowsCollapsed, 3);
  assert.deepEqual(parsed.offeringsByQuarter, { Fall: 9, Winter: 10, Spring: 13 });
});

test("stores empty instructors and a nullable lastUpdated value", () => {
  const parsed = parsePhysicsCourseOfferings(fixture);
  assert.ok(parsed.offerings.every(({ instructors }) => instructors.length === 0));
  assert.equal(parsed.lastUpdated, null);
});

test("reports malformed course identifiers without creating aliases", () => {
  const $ = load(fixture);
  $("table")
    .first()
    .find("tbody")
    .append(
      "<tr><th scope='row'>PH80</th><td>Malformed honors course</td><td>F</td><td></td><td></td></tr>",
    );
  const parsed = parsePhysicsCourseOfferings($.html());
  assert.equal(parsed.courseIds.includes("PHYSICSH80"), true);
  assert.ok(
    parsed.parsingErrors.some((error) => error.includes("malformed course identifier 'PH80'")),
  );
});

test("ignores blank rows and reports malformed rows with missing cells", () => {
  const $ = load(fixture);
  $("table").first().find("tbody").append("<tr><th></th><td></td><td></td><td></td><td></td></tr>");
  $("table").first().find("tbody").append("<tr><th>P300</th><td>Incomplete row</td></tr>");
  const parsed = parsePhysicsCourseOfferings($.html());
  assert.equal(parsed.sourceTableRows, 22);
  assert.ok(parsed.parsingErrors.some((error) => error.includes("missing required cells")));
});

test("reports a missing tentative-offerings table", () => {
  const $ = load(fixture);
  $("table").first().remove();
  const parsed = parsePhysicsCourseOfferings($.html());
  assert.equal(parsed.sourceTableRows, 0);
  assert.ok(
    parsed.parsingErrors.some((error) => error.includes("missing its tentative-offerings")),
  );
});

test("reports a missing required quarter column", () => {
  const $ = load(fixture);
  $("table").first().find("thead th").eq(4).text("Summer 2027");
  const parsed = parsePhysicsCourseOfferings($.html());
  assert.ok(parsed.parsingErrors.some((error) => error.includes("required Spring column")));
});

test("reports an unexpectedly empty required quarter", () => {
  const $ = load(fixture);
  $("table")
    .first()
    .find("tbody tr")
    .each((_index, row) => {
      $(row).children("td").eq(2).empty();
    });
  const parsed = parsePhysicsCourseOfferings($.html());
  assert.ok(parsed.parsingErrors.some((error) => error.includes("no usable Winter offerings")));
});

test("reports quarter years that do not match the explicit academic year", () => {
  const $ = load(fixture);
  $("table").first().find("thead th").eq(2).text("Fall 2025");
  const parsed = parsePhysicsCourseOfferings($.html());
  assert.ok(parsed.parsingErrors.some((error) => error.includes("does not belong")));
});

test("selects only exact future source terms using calendar metadata", () => {
  const parsed = parsePhysicsCourseOfferings(fixture);
  const selected = selectImportablePhysicsOfferings(
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
