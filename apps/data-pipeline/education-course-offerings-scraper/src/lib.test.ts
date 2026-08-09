import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { load } from "cheerio";
import {
  extractEducationCourseIds,
  isEducationPlaceholder,
  normalizeEducationCourseId,
  normalizeEducationText,
  parseEducationAcademicYear,
  parseEducationCourseOfferings,
  parseEducationDisplayedLastUpdated,
  parseEducationPhdCourseOfferings,
  parseEducationTermHeader,
  selectImportableEducationOfferings,
} from "./lib.ts";

const fixture = await readFile(
  join(dirname(fileURLToPath(import.meta.url)), "../test/fixtures/tentative-course-schedule.html"),
  "utf8",
);
const phdFixture = await readFile(
  join(dirname(fileURLToPath(import.meta.url)), "../test/fixtures/phd-2026-2027.csv"),
  "utf8",
);

test("normalizes Education course IDs and Unicode formatting artifacts", () => {
  assert.equal(normalizeEducationCourseId("EDUC 10"), "EDUC10");
  assert.equal(normalizeEducationCourseId("Ed 217T"), "EDUC217T");
  assert.equal(normalizeEducationCourseId("ED238D"), "EDUC238D");
  assert.equal(normalizeEducationCourseId("EDUC 104D"), "EDUC104D");
  assert.equal(normalizeEducationCourseId("EDUC 120A"), "EDUC120A");
  assert.equal(normalizeEducationCourseId("EDUC 179W"), "EDUC179W");
  assert.equal(normalizeEducationCourseId("EDUC 191"), "EDUC191");
  assert.equal(normalizeEducationCourseId("\u200bEDUC\u00a0007A"), "EDUC7A");
  assert.equal(normalizeEducationCourseId("PUBHLTH 10"), null);
  assert.equal(normalizeEducationText("\u200b EDUC\u00a0  25 \n"), "EDUC 25");
});

test("extracts the explicit academic year, terms, and month-level update value", () => {
  assert.deepEqual(parseEducationAcademicYear(fixture), {
    academicYear: "2026-2027",
    startYear: 2026,
  });
  assert.deepEqual(parseEducationTermHeader("Fall 2026", "2026-2027"), {
    header: "Fall 2026",
    academicYear: "2026-2027",
    year: "2026",
    quarter: "Fall",
  });
  assert.equal(parseEducationDisplayedLastUpdated(fixture), "05/2026");
  assert.equal(
    parseEducationDisplayedLastUpdated("<p>Last Updated: 05/2026Review the schedule</p>"),
    "05/2026",
  );
});

test("discovers the live-style table and parses all three quarter columns", () => {
  const parsed = parseEducationCourseOfferings(fixture);

  assert.equal(parsed.sourceTableRows, 10);
  assert.deepEqual(parsed.courseEntriesByQuarter, {
    Fall: 7,
    Winter: 8,
    Spring: 10,
  });
  assert.equal(parsed.normalizedCourseEntries, 25);
  assert.equal(parsed.offerings.length, 24);
  assert.equal(parsed.courseIds.length, 11);
  assert.equal(parsed.duplicateTopicRowsCollapsed, 1);
  assert.deepEqual(
    parsed.terms.map(({ year, quarter }) => `${year} ${quarter}`),
    ["2026 Fall", "2027 Winter", "2027 Spring"],
  );
  assert.deepEqual(parsed.parsingErrors, []);
});

test("parses numeric, letter-suffixed, and writing-suffixed courses", () => {
  const parsed = parseEducationCourseOfferings(fixture);
  assert.ok(parsed.courseIds.includes("EDUC10"));
  assert.ok(parsed.courseIds.includes("EDUC104D"));
  assert.ok(parsed.courseIds.includes("EDUC120A"));
  assert.ok(parsed.courseIds.includes("EDUC179W"));
  assert.ok(parsed.courseIds.includes("EDUC191"));
});

test("treats titles, GE annotations, parentheses, and mentioned courses as metadata", () => {
  assert.deepEqual(
    extractEducationCourseIds("EDUC 10: Research Design (GE III; concurrent with EDUC 191)"),
    ["EDUC10"],
  );
  assert.deepEqual(
    extractEducationCourseIds("EDUC 179W: Advanced Writing for Education Science (GE I)."),
    ["EDUC179W"],
  );
});

test("handles line breaks and multiple explicit courses in one visual cell", () => {
  assert.deepEqual(
    extractEducationCourseIds(
      "\u200bEDUC\u00a070: Bilingual Minds\n(GE III)\n• EDUC 101: Bilingual Tutoring",
    ),
    ["EDUC70", "EDUC101"],
  );

  const $ = load(fixture);
  $("table.simple-table tr")
    .eq(7)
    .children("td")
    .eq(0)
    .html("EDUC 70: Bilingual Minds<br><br>EDUC 101: Bilingual Tutoring");
  const parsed = parseEducationCourseOfferings($.html());
  assert.ok(
    parsed.offerings.some(({ courseId, quarter }) => courseId === "EDUC70" && quarter === "Fall"),
  );
  assert.ok(
    parsed.offerings.some(({ courseId, quarter }) => courseId === "EDUC101" && quarter === "Fall"),
  );
});

test("keeps cross-term offerings and collapses repeated EDUC 180 topics in one term", () => {
  const parsed = parseEducationCourseOfferings(fixture);
  assert.deepEqual(
    parsed.offerings
      .filter(({ courseId }) => courseId === "EDUC10")
      .map(({ year, quarter }) => `${year} ${quarter}`),
    ["2026 Fall", "2027 Winter", "2027 Spring"],
  );
  assert.equal(
    parsed.offerings.filter(
      ({ courseId, quarter }) => courseId === "EDUC180" && quarter === "Spring",
    ).length,
    1,
  );
  assert.equal(parsed.duplicateTopicRowsCollapsed, 1);
});

test("treats punctuation-only and blank cells as unoffered placeholders", () => {
  assert.equal(isEducationPlaceholder("."), true);
  assert.equal(isEducationPlaceholder(" — "), true);
  assert.equal(isEducationPlaceholder("\u200b\u00a0"), true);
  assert.equal(isEducationPlaceholder("EDUC 10"), false);

  const $ = load(fixture);
  $("table.simple-table tr").eq(7).children("td").eq(0).text("—");
  const parsed = parseEducationCourseOfferings($.html());
  assert.deepEqual(parsed.parsingErrors, []);
});

test("stores no inferred instructors and keeps lastUpdated null", () => {
  const parsed = parseEducationCourseOfferings(fixture);
  assert.ok(parsed.offerings.every(({ instructors }) => instructors.length === 0));
  assert.equal(parsed.lastUpdated, null);
  assert.equal(parsed.displayedSourceUpdateValue, "05/2026");
});

test("reports malformed non-placeholder cell content", () => {
  const $ = load(fixture);
  $("table.simple-table tr").eq(7).children("td").eq(0).text("Registration note only");
  const parsed = parseEducationCourseOfferings($.html());
  assert.ok(parsed.parsingErrors.some((error) => error.includes("unrecognized content")));
});

test("reports a missing main schedule table", () => {
  const $ = load(fixture);
  $("table.simple-table").remove();
  const parsed = parseEducationCourseOfferings($.html());
  assert.equal(parsed.sourceTableRows, 0);
  assert.ok(parsed.parsingErrors.some((error) => error.includes("main schedule table")));
});

test("reports a missing required quarter column", () => {
  const $ = load(fixture);
  $("table.simple-table tr").first().children("td").eq(2).text("Summer 2027");
  const parsed = parseEducationCourseOfferings($.html());
  assert.ok(parsed.parsingErrors.some((error) => error.includes("required Spring column")));
});

test("reports an unexpectedly empty required quarter", () => {
  const $ = load(fixture);
  $("table.simple-table tr")
    .slice(1)
    .each((_index, row) => {
      $(row).children("td").eq(1).text(".");
    });
  const parsed = parseEducationCourseOfferings($.html());
  assert.ok(parsed.parsingErrors.some((error) => error.includes("no usable Winter")));
});

test("ignores blank rows and reports malformed rows with missing cells", () => {
  const $ = load(fixture);
  $("table.simple-table tbody tr").first().after("<tr><td>EDUC 10: Incomplete row</td></tr>");
  const parsed = parseEducationCourseOfferings($.html());
  assert.equal(parsed.sourceTableRows, 11);
  assert.ok(parsed.parsingErrors.some((error) => error.includes("missing its Winter")));
  assert.ok(parsed.parsingErrors.some((error) => error.includes("missing its Spring")));
});

test("keeps an imprecise or absent update date nullable and reports malformed display text", () => {
  const absent = load(fixture);
  absent("strong").remove();
  const parsedAbsent = parseEducationCourseOfferings(absent.html());
  assert.equal(parsedAbsent.displayedSourceUpdateValue, null);
  assert.equal(parsedAbsent.lastUpdated, null);

  const malformed = fixture.replace("Last Updated: 05/2026", "Last Updated: May 2026");
  const parsedMalformed = parseEducationCourseOfferings(malformed);
  assert.equal(parsedMalformed.displayedSourceUpdateValue, null);
  assert.ok(parsedMalformed.parsingErrors.some((error) => error.includes("last updated")));
});

test("parses the public Education Ph.D. Google Sheet export by explicit term headers", () => {
  const parsed = parseEducationPhdCourseOfferings(phdFixture);
  assert.equal(parsed.academicYear, "2026-2027");
  assert.deepEqual(
    parsed.terms.map(({ year, quarter }) => `${year} ${quarter}`),
    ["2026 Fall", "2027 Winter", "2027 Spring"],
  );
  assert.equal(parsed.lastUpdated?.toISOString(), "2026-05-28T00:00:00.000Z");
  assert.ok(parsed.courseIds.includes("EDUC222"));
  assert.ok(parsed.courseIds.includes("EDUC296A"));
  assert.ok(parsed.courseIds.includes("EDUC217T"));
  assert.ok(parsed.courseIds.includes("EDUC238D"));
  assert.ok(
    parsed.offerings.some(
      ({ courseId, quarter }) => courseId === "EDUC399" && quarter === "Spring",
    ),
  );
  assert.deepEqual(parsed.parsingErrors, []);
  assert.ok(parsed.offerings.every(({ instructors }) => Array.isArray(instructors)));
});

test("deduplicates repeated Ph.D. course-term rows and rejects malformed presentation IDs", () => {
  const parsed = parseEducationPhdCourseOfferings(
    phdFixture.replace(
      "EDUC 399 Proseminar Richland",
      "EDUC 399 Proseminar Richland\nEDUC 399 Proseminar Richland",
    ),
  );
  assert.equal(
    parsed.offerings.filter(({ courseId, quarter }) => courseId === "EDUC399" && quarter === "Fall")
      .length,
    1,
  );
  assert.equal(parsed.courseIds.includes("EDUC238D"), true);
});

test("selects only exact future terms using calendar metadata", () => {
  const parsed = parseEducationCourseOfferings(fixture);
  const selected = selectImportableEducationOfferings(
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
