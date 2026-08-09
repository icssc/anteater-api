import {
  HUMANITIES_ACADEMIC_YEAR,
  type HumanitiesSource,
  normalizeHumanitiesCourseId,
  type ParsedHumanitiesOffering,
  type ParsedHumanitiesSource,
} from "@apps/humanities-course-offerings-scraper";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { make as makeBitmap } from "pureimage";
import { createOCREngine } from "tesseract-wasm";

export const COMPARATIVE_LITERATURE_SOURCE =
  "COMPARATIVE_LITERATURE_COURSE_OFFERINGS" as const satisfies HumanitiesSource;
export const COMPARATIVE_LITERATURE_SOURCE_URL =
  "https://sites.uci.edu/humsched/files/2026/05/COM-LIT-2026.pdf";

type Quarter = "Fall" | "Winter" | "Spring";
type OcrRect = { left: number; top: number; right: number; bottom: number };
export type ComparativeLiteratureOcrBox = OcrRect & { confidence: number; text: string };
type OcrImage = { data: Uint8Array; width: number; height: number };
type OcrEngine = Awaited<ReturnType<typeof createOCREngine>>;
type OcrDependencies = {
  renderPage?: (bytes: Uint8Array) => Promise<OcrImage>;
  createEngine?: typeof createOCREngine;
};

const OCR_WASM_URL = "https://cdn.jsdelivr.net/npm/tesseract-wasm@0.11.0/dist/tesseract-core.wasm";
const OCR_MODEL_URL =
  "https://cdn.jsdelivr.net/gh/tesseract-ocr/tessdata_fast@4.1.0/eng.traineddata";
let ocrAssetsPromise: Promise<{ wasm: Uint8Array; model: Uint8Array }> | null = null;

const normalize = (value: string) =>
  value
    .normalize("NFKC")
    .replaceAll(/[\s\p{Z}]+/gu, " ")
    .trim();

const likelyInstructor = (value: string): string[] => {
  const normalized = normalize(value);
  if (!normalized || /^(?:\?|tba|tbd|staff)$/i.test(normalized))
    return /^tbd$/i.test(normalized) ? ["TBD"] : [];
  if (/^(?:emeriti|lecturer|teaching\s+associate)$/i.test(normalized)) return [];
  return normalized
    .split(/\s*\/\s*/)
    .map(normalize)
    .filter(Boolean);
};

async function ocrAssets(fetcher: typeof fetch) {
  if (!ocrAssetsPromise) {
    ocrAssetsPromise = Promise.all([fetcher(OCR_WASM_URL), fetcher(OCR_MODEL_URL)])
      .then(async ([wasmResponse, modelResponse]) => {
        if (!wasmResponse.ok || !modelResponse.ok)
          throw new Error("Unable to fetch pinned OCR engine assets");
        return {
          wasm: new Uint8Array(await wasmResponse.arrayBuffer()),
          model: new Uint8Array(await modelResponse.arrayBuffer()),
        };
      })
      .catch((error) => {
        ocrAssetsPromise = null;
        throw error;
      });
  }
  return ocrAssetsPromise;
}

function patchPureImageTransform(context: Record<string, unknown>) {
  type Transform = Record<string, number> & { invertSelf?: () => Transform };
  const original = (context.getTransform as () => Transform).bind(context);
  context.getTransform = () => {
    const matrix = original();
    matrix.invertSelf = () => {
      const determinant = matrix.a * matrix.d - matrix.b * matrix.c;
      const a = matrix.a;
      const b = matrix.b;
      const c = matrix.c;
      const d = matrix.d;
      const e = matrix.e;
      const f = matrix.f;
      matrix.a = d / determinant;
      matrix.b = -b / determinant;
      matrix.c = -c / determinant;
      matrix.d = a / determinant;
      matrix.e = (c * f - d * e) / determinant;
      matrix.f = (b * e - a * f) / determinant;
      return matrix;
    };
    return matrix;
  };
}

export async function renderComparativeLiteraturePdfPage(bytes: Uint8Array): Promise<OcrImage> {
  const document = await getDocument({
    data: bytes,
    disableWorker: true,
    isEvalSupported: false,
  } as never).promise;
  try {
    const page = await document.getPage(1);
    const viewport = page.getViewport({ scale: 4 });
    const canvas = makeBitmap(viewport.width, viewport.height);
    const context = canvas.getContext("2d") as unknown as Record<string, unknown>;
    patchPureImageTransform(context);
    (context.beginPath as () => void)();
    await page.render({
      canvasContext: context,
      viewport,
      canvasFactory: {
        create(width: number, height: number) {
          const child = makeBitmap(width, height);
          const childContext = child.getContext("2d") as unknown as Record<string, unknown>;
          patchPureImageTransform(childContext);
          (childContext.beginPath as () => void)();
          return { canvas: child, context: childContext };
        },
        reset() {},
        destroy() {},
      },
    } as never).promise;
    return { data: canvas.data, width: canvas.width, height: canvas.height };
  } finally {
    await document.cleanup();
    await document.destroy();
  }
}

export async function extractComparativeLiteratureOcrBoxes(
  bytes: Uint8Array,
  fetcher: typeof fetch = fetch,
  dependencies: OcrDependencies = {},
): Promise<ComparativeLiteratureOcrBox[]> {
  const image = await (dependencies.renderPage ?? renderComparativeLiteraturePdfPage)(bytes);
  const assets = await ocrAssets(fetcher);
  const createEngine = dependencies.createEngine ?? createOCREngine;
  let engine: OcrEngine | null = null;
  try {
    engine = await createEngine({ wasmBinary: assets.wasm });
    engine.loadModel(assets.model);
    engine.loadImage(image);
    return engine.getTextBoxes("word").map((box) => ({
      ...box.rect,
      confidence: box.confidence,
      text: normalize(box.text),
    }));
  } finally {
    engine?.destroy();
    ocrAssetsPromise = null;
  }
}

type OcrLine = { top: number; items: ComparativeLiteratureOcrBox[]; text: string };

function ocrLines(boxes: ComparativeLiteratureOcrBox[]): OcrLine[] {
  const lines: OcrLine[] = [];
  for (const box of [...boxes].sort((a, b) => a.top - b.top || a.left - b.left)) {
    const line = lines.at(-1);
    if (!line || Math.abs(line.top - box.top) > 18)
      lines.push({ top: box.top, items: [box], text: box.text });
    else {
      line.items.push(box);
      line.text = line.items
        .sort((a, b) => a.left - b.left)
        .map((item) => item.text)
        .join(" ");
    }
  }
  return lines;
}

function ocrInstructor(items: ComparativeLiteratureOcrBox[]): string[] {
  const words = items
    .filter((item) => item.left >= 1_100 && item.left < 1_590)
    .sort((a, b) => a.top - b.top || a.left - b.left)
    .map((item) => item.text)
    .filter((word) => !/^(?:Instructor|Host|Dept\.?)$/i.test(word))
    .filter(Boolean);
  if (words.length === 0) return [];
  const value = words.join(" ");
  if (/^(?:TBA|TBD|STAFF|EMERITI|LECTURER|TEACHING\s+ASSOCIATE)(?:\s|$)/i.test(value))
    return value.startsWith("TBD") ? ["TBD"] : [];
  return likelyInstructor(value);
}

function comparativeCourseNumber(line: OcrLine): { number: string; confidence: number } | null {
  const items = line.items.filter((item) => item.left < 380);
  const comIndex = items.findIndex((item) => /^COM$/i.test(item.text));
  const litIndex = items.findIndex((item, index) => index > comIndex && /^LIT$/i.test(item.text));
  if (comIndex < 0 || litIndex < 0) return null;
  const course = items.find((item, index) => index > litIndex && /^\d+[A-Z]*$/i.test(item.text));
  if (!course || /X{2,}/i.test(course.text)) return null;
  return { number: course.text.toUpperCase(), confidence: course.confidence };
}

export function parseComparativeLiteratureOcrBoxes(
  boxes: ComparativeLiteratureOcrBox[],
): ParsedHumanitiesSource {
  const source: HumanitiesSource = COMPARATIVE_LITERATURE_SOURCE;
  const lines = ocrLines(boxes);
  const offerings: ParsedHumanitiesOffering[] = [];
  const parsingErrors: string[] = [];
  let quarter: Quarter | null = null;
  const rows: Array<{
    line: OcrLine;
    term: { year: string; quarter: Quarter };
    number: string;
    confidence: number;
  }> = [];
  const update = lines.find((line) => /run\s+date/i.test(line.text));
  const dateMatch = update?.text.match(/(20\d{2})[-/](\d{1,2})[-/](\d{1,2})/);
  const lastUpdated = dateMatch
    ? new Date(
        `${dateMatch[1]}-${dateMatch[2].padStart(2, "0")}-${dateMatch[3].padStart(2, "0")}T00:00:00.000Z`,
      )
    : null;
  for (const line of lines) {
    const header = line.text.match(/\b(FALL|WINTER|SPRING)\s+QUARTER\b/i);
    if (header) {
      quarter = (header[1][0].toUpperCase() + header[1].slice(1).toLowerCase()) as Quarter;
      continue;
    }
    if (!quarter) continue;
    const course = comparativeCourseNumber(line);
    if (!course) continue;
    rows.push({
      line,
      term: quarter === "Fall" ? { year: "2026", quarter } : { year: "2027", quarter },
      number: course.number,
      confidence: course.confidence,
    });
  }
  const courseLineTops = lines
    .filter((line) =>
      line.items.some(
        (item) => item.left < 380 && /^(?:COM|HUMAN|FLM&MDA|SPANISH)$/i.test(item.text),
      ),
    )
    .map((line) => line.top)
    .sort((a, b) => a - b);
  const terms = Array.from(
    new Map(rows.map((row) => [`${row.term.year}|${row.term.quarter}`, row.term])).values(),
  );
  for (const row of rows) {
    if (row.confidence < 0.8) {
      parsingErrors.push(`Low-confidence Comparative Literature course identifier ${row.number}`);
      continue;
    }
    const courseId = normalizeHumanitiesCourseId("COM LIT", row.number);
    if (!courseId) {
      parsingErrors.push(`Unable to normalize Comparative Literature course ${row.number}`);
      continue;
    }
    const lineIndex = courseLineTops.indexOf(row.line.top);
    const previousTop = lineIndex > 0 ? courseLineTops[lineIndex - 1] : row.line.top - 24;
    const nextTop = courseLineTops[lineIndex + 1] ?? row.line.top + 48;
    const lowerBound = (previousTop + row.line.top) / 2;
    const upperBound = (row.line.top + nextTop) / 2;
    const instructors = ocrInstructor(
      boxes.filter((box) => box.top >= lowerBound && box.top < upperBound),
    );
    const existing = offerings.find(
      (offering) =>
        offering.courseId === courseId &&
        offering.year === row.term.year &&
        offering.quarter === row.term.quarter,
    );
    if (existing)
      existing.instructors = Array.from(new Set([...existing.instructors, ...instructors]));
    else
      offerings.push({
        source,
        sourceUrl: COMPARATIVE_LITERATURE_SOURCE_URL,
        academicYear: HUMANITIES_ACADEMIC_YEAR,
        courseId,
        year: row.term.year,
        quarter: row.term.quarter,
        instructors,
      });
  }
  return {
    source,
    sourceUrl: COMPARATIVE_LITERATURE_SOURCE_URL,
    academicYear: HUMANITIES_ACADEMIC_YEAR,
    lastUpdated: lastUpdated && !Number.isNaN(lastUpdated.getTime()) ? lastUpdated : null,
    terms,
    offerings,
    rowsParsed: rows.length,
    duplicateRowsCollapsed: rows.length - offerings.length,
    parsingErrors:
      terms.length < 3
        ? ["Comparative Literature did not expose all three quarters", ...parsingErrors]
        : parsingErrors,
  };
}

export async function parseComparativeLiteraturePdf(
  bytes: Uint8Array,
  fetcher: typeof fetch = fetch,
  dependencies: OcrDependencies = {},
): Promise<ParsedHumanitiesSource> {
  return parseComparativeLiteratureOcrBoxes(
    await extractComparativeLiteratureOcrBoxes(bytes, fetcher, dependencies),
  );
}
