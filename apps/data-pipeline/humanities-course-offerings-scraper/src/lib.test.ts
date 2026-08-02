import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import {
  type HumanitiesOcrBox,
  type HumanitiesPdfSource,
  normalizeHumanitiesCourseId,
  parseComparativeLiteratureOcrBoxes,
  parseEnglishCanvaHtml,
  parseHumanitiesPdf,
  resolveHumanitiesInstructors,
} from "./lib.ts";

const fixtureDirectory = resolve(dirname(fileURLToPath(import.meta.url)), "../test/fixtures");
const fixture = async (name: string) =>
  new Uint8Array(await readFile(resolve(fixtureDirectory, `${name}.pdf`)));
const htmlFixture = async (name: string) =>
  readFile(resolve(fixtureDirectory, `${name}.html`), "utf8");

test("normalizes Humanities department labels to catalogue identifiers", () => {
  assert.equal(normalizeHumanitiesCourseId("Art His", "42E"), "ARTHIS42E");
  assert.equal(normalizeHumanitiesCourseId("FMS", "101D"), "FLM&MDA101D");
  assert.equal(normalizeHumanitiesCourseId("GSS", "50A"), "GEN&SEX50A");
  assert.equal(normalizeHumanitiesCourseId("Med Hum", "137"), "MEDHUM137");
  assert.equal(normalizeHumanitiesCourseId("JPN", "1A"), "JAPANSE1A");
  assert.equal(normalizeHumanitiesCourseId("Com Lit", "101W"), "COMLIT101W");
  assert.equal(normalizeHumanitiesCourseId("Lit Jrn", "101BW"), "LITJRN101BW");
  assert.equal(normalizeHumanitiesCourseId("WR", "90"), "WRITING90");
  assert.equal(normalizeHumanitiesCourseId("English", "H80"), "ENGLISHH80");
  assert.equal(normalizeHumanitiesCourseId("Unknown", "1"), null);
});

test("resolves unambiguous source abbreviations and preserves TBD", () => {
  const resolved = resolveHumanitiesInstructors(
    ["Acosta, C", "TBD", "Unknown"],
    [{ name: "Carlos Acosta", ucinetid: "cacosta", department: "Art History" }],
  );
  assert.deepEqual(resolved, [
    { status: "assigned", name: "Acosta, C", ucinetid: "cacosta" },
    { status: "tbd", name: "TBD", ucinetid: null },
  ]);
});

test("parses sectioned undergraduate schedules, duplicate topics, and exact updates", async () => {
  const parsed = await parseHumanitiesPdf(
    "ART_HISTORY_COURSE_OFFERINGS",
    await fixture("AH-SCHED_2026"),
  );
  assert.deepEqual(parsed.terms, [
    { year: "2026", quarter: "Fall" },
    { year: "2027", quarter: "Winter" },
    { year: "2027", quarter: "Spring" },
  ]);
  assert.equal(
    parsed.offerings.filter((o) => o.courseId === "ARTHIS198" && o.quarter === "Fall").length,
    1,
  );
  assert.equal(parsed.lastUpdated, null);
  assert.ok(parsed.offerings.some((o) => o.courseId === "ARTHIS44" && o.quarter === "Winter"));
});

test("keeps primary course departments and excludes non-primary cross-lists", async () => {
  const cases: Array<[HumanitiesPdfSource, string, string, string]> = [
    ["AFRICAN_AMERICAN_STUDIES_COURSE_OFFERINGS", "AFAM-2026", "AFAM40A", "Fall"],
    ["ARMENIAN_STUDIES_COURSE_OFFERINGS", "ARMN-STU-2026", "ARMN1C", "Spring"],
    ["CLASSICS_COURSE_OFFERINGS", "CLASSICS-2026", "CLASSIC170", "Winter"],
    ["RELIGIOUS_STUDIES_COURSE_OFFERINGS", "REL-STU-2026", "RELSTD170", "Winter"],
  ];
  for (const [source, file, courseId, quarter] of cases) {
    const parsed = await parseHumanitiesPdf(source, await fixture(file));
    assert.ok(parsed.offerings.some((o) => o.courseId === courseId && o.quarter === quarter));
  }
  const classics = await parseHumanitiesPdf(
    "CLASSICS_COURSE_OFFERINGS",
    await fixture("CLASSICS-2026"),
  );
  assert.ok(!classics.offerings.some((o) => o.courseId === "HISTORY131A"));
  const religious = await parseHumanitiesPdf(
    "RELIGIOUS_STUDIES_COURSE_OFFERINGS",
    await fixture("REL-STU-2026"),
  );
  assert.ok(!religious.offerings.some((o) => o.courseId === "HISTORY131B"));
});

test("parses columnar terms, laboratory-like suffixes, and missing instructors without invention", async () => {
  const fms = await parseHumanitiesPdf(
    "FILM_MEDIA_STUDIES_COURSE_OFFERINGS",
    await fixture("FMS-2026"),
  );
  assert.ok(fms.offerings.some((o) => o.courseId === "FLM&MDA101D" && o.quarter === "Fall"));
  assert.ok(fms.offerings.some((o) => o.courseId === "FLM&MDA285A" && o.quarter === "Fall"));
  assert.ok(fms.offerings.every((o) => o.instructors.length === 0));
  const spanish = await parseHumanitiesPdf(
    "SPANISH_PORTUGUESE_COURSE_OFFERINGS",
    await fixture("LAIC-2026"),
  );
  assert.ok(spanish.offerings.some((o) => o.courseId === "SPANISH3H" && o.quarter === "Fall"));
  assert.equal(spanish.lastUpdated?.toISOString(), "2026-03-11T00:00:00.000Z");
});

test("parses East Asian language columns and philosophy medical humanities terms", async () => {
  const eas = await parseHumanitiesPdf(
    "EAST_ASIAN_STUDIES_COURSE_OFFERINGS",
    await fixture("EAS-SCHED_2026"),
  );
  assert.ok(eas.offerings.some((o) => o.courseId === "EAS110" && o.quarter === "Fall"));
  assert.ok(eas.offerings.some((o) => o.courseId === "CHINESE100A" && o.quarter === "Fall"));
  assert.ok(eas.offerings.some((o) => o.courseId === "JAPANSE1A" && o.quarter === "Fall"));
  assert.ok(
    eas.offerings.some((o) => o.courseId === "EAS110" && o.instructors.includes("Bert Scruggs")),
  );
  assert.equal(eas.lastUpdated?.toISOString(), "2026-06-15T00:00:00.000Z");
  const philosophy = await parseHumanitiesPdf(
    "PHILOSOPHY_MEDICAL_HUMANITIES_COURSE_OFFERINGS",
    await fixture("PHILOS-MEDHUM-2026-1"),
  );
  assert.ok(philosophy.offerings.some((o) => o.courseId === "MEDHUM3" && o.quarter === "Spring"));
  assert.ok(philosophy.offerings.some((o) => o.courseId === "PHILOS164" && o.quarter === "Fall"));
});

test("parses the English Canva schedule, explicit departments, terms, and update date", async () => {
  const parsed = parseEnglishCanvaHtml(await htmlFixture("ENGLISH-2026"));
  assert.equal(parsed.academicYear, "2026-2027");
  assert.equal(parsed.lastUpdated?.toISOString(), "2026-07-24T00:00:00.000Z");
  assert.deepEqual(parsed.terms, [
    { year: "2026", quarter: "Fall" },
    { year: "2027", quarter: "Winter" },
    { year: "2027", quarter: "Spring" },
  ]);
  assert.ok(parsed.offerings.some((o) => o.courseId === "ENGLISH10" && o.quarter === "Fall"));
  assert.ok(parsed.offerings.some((o) => o.courseId === "LITJRN20" && o.quarter === "Winter"));
  assert.ok(parsed.offerings.some((o) => o.courseId === "WRITING30" && o.quarter === "Fall"));
  assert.ok(parsed.offerings.some((o) => o.courseId === "ENGLISHH80" && o.quarter === "Spring"));
  assert.ok(parsed.duplicateRowsCollapsed > 0);
  assert.ok(parsed.offerings.some((o) => o.instructors.includes("K. Grady")));
  assert.ok(
    parsed.offerings
      .filter((o) => o.instructors.length === 0)
      .some((o) => o.courseId === "ENGLISH17"),
  );
  assert.equal(parsed.parsingErrors.length, 0);
});

function ocrBox(text: string, left: number, top: number, confidence = 0.99): HumanitiesOcrBox {
  return {
    text,
    left,
    top,
    right: left + text.length * 12,
    bottom: top + 20,
    confidence,
  };
}

test("parses Comparative Literature OCR rows, skips cross-lists/placeholders, and deduplicates", () => {
  const boxes: HumanitiesOcrBox[] = [
    ocrBox("Run Date: 2026-05-22", 20, 20),
    ocrBox("FALL QUARTER", 20, 100),
    ocrBox("COM", 20, 180),
    ocrBox("LIT", 75, 180),
    ocrBox("10", 130, 180),
    ocrBox("Smith, Jane", 1120, 180),
    ocrBox("COM", 20, 220),
    ocrBox("LIT", 75, 220),
    ocrBox("10", 130, 220),
    ocrBox("TBD", 1120, 220),
    ocrBox("HUMAN", 20, 260),
    ocrBox("260A", 95, 260),
    ocrBox("WINTER QUARTER", 20, 340),
    ocrBox("COM", 20, 420),
    ocrBox("LIT", 75, 420),
    ocrBox("60B", 130, 420),
    ocrBox("SPRING QUARTER", 20, 500),
    ocrBox("COM", 20, 580),
    ocrBox("LIT", 75, 580),
    ocrBox("150", 130, 580),
    ocrBox("COM", 20, 640),
    ocrBox("LIT", 75, 640),
    ocrBox("1XX", 130, 640),
  ];
  const parsed = parseComparativeLiteratureOcrBoxes(boxes);
  assert.equal(parsed.lastUpdated?.toISOString(), "2026-05-22T00:00:00.000Z");
  assert.deepEqual(parsed.terms, [
    { year: "2026", quarter: "Fall" },
    { year: "2027", quarter: "Winter" },
    { year: "2027", quarter: "Spring" },
  ]);
  assert.equal(parsed.offerings.filter((o) => o.courseId === "COMLIT10").length, 1);
  assert.equal(parsed.offerings.filter((o) => o.courseId === "COMLIT150").length, 1);
  assert.equal(
    parsed.offerings.find((o) => o.courseId === "COMLIT10")?.instructors[0],
    "Smith, Jane",
  );
  assert.ok(
    parsed.offerings.some((o) => o.courseId === "COMLIT10" && o.instructors.includes("TBD")),
  );
  assert.ok(!parsed.offerings.some((o) => o.courseId.startsWith("HUMAN")));
  assert.equal(parsed.parsingErrors.length, 0);
  assert.equal(parsed.duplicateRowsCollapsed, 1);
});

test("rejects ambiguous Comparative Literature OCR identifiers instead of guessing", () => {
  const boxes: HumanitiesOcrBox[] = [
    ocrBox("FALL   QUARTER", 20, 100),
    ocrBox("COM", 20, 180),
    ocrBox("LIT", 75, 180),
    ocrBox("9", 130, 180),
    ocrBox("WINTER QUARTER", 20, 300),
    ocrBox("COM", 20, 380),
    ocrBox("LIT", 75, 380),
    ocrBox("10", 130, 380, 0.61),
    ocrBox("SPRING QUARTER", 20, 500),
    ocrBox("COM", 20, 580),
    ocrBox("LIT", 75, 580),
    ocrBox("60C", 130, 580),
  ];
  const parsed = parseComparativeLiteratureOcrBoxes(boxes);
  assert.ok(parsed.parsingErrors.some((error) => error.includes("Low-confidence")));
  assert.ok(!parsed.offerings.some((o) => o.courseId === "COMLIT10"));
  assert.deepEqual(parsed.terms, [
    { year: "2026", quarter: "Fall" },
    { year: "2027", quarter: "Winter" },
    { year: "2027", quarter: "Spring" },
  ]);
});
