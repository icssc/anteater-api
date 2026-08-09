import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import {
  COMPARATIVE_LITERATURE_SOURCE,
  type ComparativeLiteratureOcrBox,
  doScrape,
  extractComparativeLiteratureOcrBoxes,
  importParsedComparativeLiteratureSource,
  isComparativeLiteratureCleanupAllowed,
  type ParsedHumanitiesSource,
  parseComparativeLiteratureOcrBoxes,
  renderComparativeLiteraturePdfPage,
} from "./lib.ts";

const fixtureDirectory = resolve(dirname(fileURLToPath(import.meta.url)), "../test/fixtures");
const fixture = async () =>
  new Uint8Array(await readFile(resolve(fixtureDirectory, "COM-LIT-2026.pdf")));

function box(
  text: string,
  left: number,
  top: number,
  confidence = 0.99,
): ComparativeLiteratureOcrBox {
  return { text, left, top, right: left + text.length * 12, bottom: top + 20, confidence };
}

test("parses OCR rows, explicit COM LIT entries, update date, and duplicates", () => {
  const parsed = parseComparativeLiteratureOcrBoxes([
    box("Run Date: 2026-05-22", 20, 20),
    box("FALL QUARTER", 20, 100),
    box("COM", 20, 180),
    box("LIT", 75, 180),
    box("10", 130, 180),
    box("Smith, Jane", 1120, 180),
    box("COM", 20, 220),
    box("LIT", 75, 220),
    box("10", 130, 220),
    box("TBD", 1120, 220),
    box("HUMAN", 20, 260),
    box("260A", 95, 260),
    box("WINTER QUARTER", 20, 340),
    box("COM", 20, 420),
    box("LIT", 75, 420),
    box("60B", 130, 420),
    box("SPRING QUARTER", 20, 500),
    box("COM", 20, 580),
    box("LIT", 75, 580),
    box("150", 130, 580),
    box("COM", 20, 640),
    box("LIT", 75, 640),
    box("1XX", 130, 640),
  ]);
  assert.equal(parsed.source, COMPARATIVE_LITERATURE_SOURCE);
  assert.equal(parsed.lastUpdated?.toISOString(), "2026-05-22T00:00:00.000Z");
  assert.deepEqual(parsed.terms, [
    { year: "2026", quarter: "Fall" },
    { year: "2027", quarter: "Winter" },
    { year: "2027", quarter: "Spring" },
  ]);
  assert.equal(parsed.offerings.filter((offering) => offering.courseId === "COMLIT10").length, 1);
  assert.equal(parsed.offerings.filter((offering) => offering.courseId === "COMLIT150").length, 1);
  assert.ok(
    parsed.offerings
      .find((offering) => offering.courseId === "COMLIT10")
      ?.instructors.includes("TBD"),
  );
  assert.ok(!parsed.offerings.some((offering) => offering.courseId.startsWith("HUMAN")));
  assert.equal(parsed.duplicateRowsCollapsed, 1);
  assert.equal(parsed.parsingErrors.length, 0);
});

test("ambiguous identifiers produce errors and disable cleanup", () => {
  const parsed = parseComparativeLiteratureOcrBoxes([
    box("FALL QUARTER", 20, 100),
    box("COM", 20, 180),
    box("LIT", 75, 180),
    box("10", 130, 180, 0.61),
    box("WINTER QUARTER", 20, 300),
    box("COM", 20, 380),
    box("LIT", 75, 380),
    box("60B", 130, 380),
    box("SPRING QUARTER", 20, 500),
    box("COM", 20, 580),
    box("LIT", 75, 580),
    box("60C", 130, 580),
  ]);
  assert.ok(parsed.parsingErrors.some((error) => error.includes("Low-confidence")));
  assert.equal(isComparativeLiteratureCleanupAllowed(parsed), false);
});

test("missing or empty required terms disable cleanup", () => {
  const parsed = parseComparativeLiteratureOcrBoxes([
    box("FALL QUARTER", 20, 100),
    box("COM", 20, 180),
    box("LIT", 75, 180),
    box("10", 130, 180),
  ]);
  assert.ok(parsed.parsingErrors.some((error) => error.includes("all three quarters")));
  assert.equal(isComparativeLiteratureCleanupAllowed(parsed), false);
});

test("OCR initialization and rasterization failures are propagated without a stale engine", async () => {
  const bytes = await fixture();
  const okFetcher: typeof fetch = async () =>
    new Response(new Uint8Array([1, 2, 3]), { status: 200 });
  await assert.rejects(
    extractComparativeLiteratureOcrBoxes(bytes, okFetcher, {
      renderPage: async () => ({ data: new Uint8Array(), width: 1, height: 1 }),
      createEngine: async () => {
        throw new Error("controlled OCR initialization failure");
      },
    }),
    /controlled OCR initialization failure/,
  );
  await assert.rejects(
    extractComparativeLiteratureOcrBoxes(bytes, okFetcher, {
      renderPage: async () => {
        throw new Error("controlled rasterization failure");
      },
    }),
    /controlled rasterization failure/,
  );
});

test("rasterizes the real PDF fixture and completes the OCR adapter path", async () => {
  const bytes = await fixture();
  const raster = await renderComparativeLiteraturePdfPage(bytes);
  assert.ok(raster.width > 1_000);
  assert.ok(raster.height > 1_000);
  assert.equal(raster.data.length, raster.width * raster.height * 4);

  let imageLoaded = false;
  let engineDestroyed = false;
  const boxes = await extractComparativeLiteratureOcrBoxes(
    await fixture(),
    async () => new Response(new Uint8Array([1, 2, 3]), { status: 200 }),
    {
      createEngine: (async () => ({
        loadModel(model: Uint8Array) {
          assert.ok(model.length > 0);
        },
        loadImage(image: { data: Uint8Array; width: number; height: number }) {
          imageLoaded = image.width > 1_000 && image.height > 1_000 && image.data.length > 0;
        },
        getTextBoxes() {
          return [
            {
              rect: { left: 20, top: 20, right: 80, bottom: 40 },
              confidence: 0.99,
              text: "FALL",
            },
          ];
        },
        destroy() {
          engineDestroyed = true;
        },
      })) as never,
    },
  );
  assert.equal(imageLoaded, true);
  assert.equal(engineDestroyed, true);
  assert.deepEqual(boxes, [
    { left: 20, top: 20, right: 80, bottom: 40, confidence: 0.99, text: "FALL" },
  ]);
});

test("upserts valid offerings while parsing errors disable cleanup", async () => {
  const parsed: ParsedHumanitiesSource = {
    source: COMPARATIVE_LITERATURE_SOURCE,
    sourceUrl: "https://example.test/com-lit.pdf",
    academicYear: "2026-2027",
    lastUpdated: null,
    terms: [
      { year: "2026", quarter: "Fall" },
      { year: "2027", quarter: "Winter" },
      { year: "2027", quarter: "Spring" },
    ],
    offerings: [
      {
        source: COMPARATIVE_LITERATURE_SOURCE,
        sourceUrl: "https://example.test/com-lit.pdf",
        academicYear: "2026-2027",
        courseId: "COMLIT10",
        year: "2026",
        quarter: "Fall",
        instructors: ["Jane Smith", "TBD"],
      },
    ],
    rowsParsed: 2,
    duplicateRowsCollapsed: 0,
    parsingErrors: ["Ambiguous second row"],
  };
  const selectResponses = [
    [{ id: "COMLIT10" }],
    [{ ucinetid: "jsmith", name: "Jane Smith", department: "Comparative Literature" }],
    [
      { year: "2026", quarter: "Fall", instructionStart: new Date("2026-09-21T00:00:00Z") },
      { year: "2027", quarter: "Winter", instructionStart: new Date("2027-01-04T00:00:00Z") },
      { year: "2027", quarter: "Spring", instructionStart: new Date("2027-03-29T00:00:00Z") },
    ],
    [],
  ];
  let selectIndex = 0;
  let deleteCalls = 0;
  const inserted: unknown[] = [];
  const db = {
    select() {
      const result = selectResponses[selectIndex++] ?? [];
      return { from: () => ({ where: async () => result }) };
    },
    transaction: async (callback: (tx: unknown) => Promise<void>) =>
      callback({
        delete() {
          deleteCalls += 1;
          return { where: async () => undefined };
        },
        insert() {
          return {
            values(values: unknown[]) {
              inserted.push(...values);
              return { onConflictDoUpdate: async () => undefined };
            },
          };
        },
      }),
  };

  const summary = await importParsedComparativeLiteratureSource(
    db as never,
    parsed,
    new Date("2026-08-01T00:00:00Z"),
  );
  assert.equal(deleteCalls, 0);
  assert.equal(inserted.length, 1);
  assert.equal(summary.rowsInserted, 1);
  assert.equal(summary.rowsDeactivated, 0);
  assert.equal(summary.resolvedInstructorAssignments, 1);
});

test("source download failures reject before any database mutation", async () => {
  await assert.rejects(
    doScrape({} as never, async () => new Response("unavailable", { status: 503 })),
    /HTTP 503/,
  );
});
