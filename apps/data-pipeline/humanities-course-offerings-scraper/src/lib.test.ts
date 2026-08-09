import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import {
  fetchEnglishCanvaHtml,
  type HumanitiesPdfSource,
  isExpectedEnglishCanvaUrl,
  loadHumanitiesSourceSafely,
  normalizeHumanitiesCourseId,
  parseEnglishCanvaHtml,
  parseGlobalLanguagesCulturesPages,
  parseHumanitiesPdf,
  resolveHumanitiesInstructors,
} from "./lib.ts";
import { runStandaloneScrape } from "./standalone.ts";

const fixtureDirectory = resolve(dirname(fileURLToPath(import.meta.url)), "../test/fixtures");
const fixture = async (name: string) =>
  new Uint8Array(await readFile(resolve(fixtureDirectory, `${name}.pdf`)));
const htmlFixture = async (name: string) =>
  readFile(resolve(fixtureDirectory, `${name}.html`), "utf8");

test("the standalone importer always closes its database client", async () => {
  const events: string[] = [];
  const db = {
    $client: {
      end: async ({ timeout }: { timeout: number }) => {
        assert.equal(timeout, 5);
        events.push("close");
      },
    },
  } as unknown as Parameters<typeof runStandaloneScrape>[0];

  await assert.rejects(
    runStandaloneScrape(db, async () => {
      events.push("scrape");
      throw new Error("controlled source failure");
    }),
    /controlled source failure/,
  );
  assert.deepEqual(events, ["scrape", "close"]);
});

test("parses current Global Languages & Cultures language tables", async () => {
  const parsed = parseGlobalLanguagesCulturesPages([
    { department: "ARABIC", html: await htmlFixture("GLC-ARABIC-2026") },
    { department: "PERSIAN", html: await htmlFixture("GLC-PERSIAN-2026") },
    { department: "VIETMSE", html: await htmlFixture("GLC-VIETMSE-2026") },
  ]);
  assert.equal(parsed.source, "GLOBAL_LANGUAGES_CULTURES_COURSE_OFFERINGS");
  assert.equal(parsed.academicYear, "2026-2027");
  assert.deepEqual(parsed.terms, [
    { year: "2026", quarter: "Fall" },
    { year: "2027", quarter: "Winter" },
    { year: "2027", quarter: "Spring" },
  ]);
  assert.ok(parsed.offerings.some((o) => o.courseId === "ARABIC1A" && o.quarter === "Fall"));
  assert.ok(parsed.offerings.some((o) => o.courseId === "PERSIAN1A" && o.quarter === "Fall"));
  assert.ok(parsed.offerings.some((o) => o.courseId === "VIETMSE1C" && o.quarter === "Spring"));
  assert.ok(
    parsed.offerings
      .find((o) => o.courseId === "PERSIAN1A")
      ?.instructors.includes("SAHRANAVARD, N."),
  );
  assert.ok(parsed.offerings.find((o) => o.courseId === "ARABIC1A")?.instructors.length === 0);
  assert.ok(
    parsed.offerings.find((o) => o.courseId === "VIETMSE1A")?.instructors.includes("TRAN, T."),
  );
  assert.equal(parsed.duplicateRowsCollapsed, 1);
  assert.equal(parsed.parsingErrors.length, 0);
  assert.equal(parsed.lastUpdated, null);
});

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

test("fetches the current public Canva viewer with a compatible user agent", async () => {
  const html = await htmlFixture("ENGLISH-2026");
  let userAgent = "";
  const fetched = await fetchEnglishCanvaHtml(async (_url, init) => {
    userAgent = String(new Headers(init?.headers).get("user-agent"));
    const response = new Response(html, { status: 200 });
    Object.defineProperty(response, "url", {
      value: "https://www.canva.com/design/DAHGGfFVuNM/V4mRsOzuq-U3Cez0TYdIyg/view",
    });
    return response;
  });
  assert.equal(fetched, html);
  assert.match(userAgent, /Mozilla\/5\.0/);
});

test("rejects a controlled truncated embedded-text PDF", async () => {
  const truncated = (await fixture("AFAM-2026")).slice(0, 128);
  await assert.rejects(
    parseHumanitiesPdf("AFRICAN_AMERICAN_STUDIES_COURSE_OFFERINGS", truncated),
    /Invalid PDF|PDF structure|InvalidPDFException/i,
  );
});

test("a failed Humanities source reports its exact error and does not stop a later source", async () => {
  const warnings: string[] = [];
  const mutations: string[] = [];
  const failed = await loadHumanitiesSourceSafely(
    "COMPARATIVE_LITERATURE_COURSE_OFFERINGS",
    async () => {
      throw new Error("controlled OCR ambiguity");
    },
    (message) => warnings.push(message),
  );
  const later = await loadHumanitiesSourceSafely(
    "GLOBAL_LANGUAGES_CULTURES_COURSE_OFFERINGS",
    async () => {
      mutations.push("later source only");
      return "parsed";
    },
    (message) => warnings.push(message),
  );

  assert.equal(failed, null);
  assert.equal(later, "parsed");
  assert.deepEqual(mutations, ["later source only"]);
  assert.deepEqual(warnings, [
    "Skipping Humanities source COMPARATIVE_LITERATURE_COURSE_OFFERINGS: controlled OCR ambiguity",
  ]);
});

test("a changed English Canva bootstrap fails before cleanup", () => {
  assert.throws(
    () => parseEnglishCanvaHtml("<html><body>changed Canva document</body></html>"),
    /Canva bootstrap JSON was not found/,
  );
});

test("validates the English Canva design before extraction", () => {
  assert.equal(
    isExpectedEnglishCanvaUrl(
      "https://www.canva.com/design/DAHGGfFVuNM/V4mRsOzuq-U3Cez0TYdIyg/view",
    ),
    true,
  );
  assert.equal(isExpectedEnglishCanvaUrl("https://www.canva.com/design/DIFFERENT/view"), false);
  assert.equal(isExpectedEnglishCanvaUrl("not a URL"), false);
});
