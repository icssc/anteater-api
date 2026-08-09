import type { database } from "@packages/db";
import { and, eq, inArray, ne, notInArray } from "@packages/db/drizzle";
import type { TentativeInstructor, Term } from "@packages/db/schema";
import { calendarTerm, course, instructor, tentativeCourseOffering } from "@packages/db/schema";
import { conflictUpdateSetAllCols } from "@packages/db/utils";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";

export const HUMANITIES_SOURCE_URL = "https://www.humanities.uci.edu/undergrad/academics/planned";
export const HUMANITIES_ACADEMIC_YEAR = "2026-2027";
export const HUMANITIES_PDF_SOURCE_IDS = [
  "AFRICAN_AMERICAN_STUDIES_COURSE_OFFERINGS",
  "ARMENIAN_STUDIES_COURSE_OFFERINGS",
  "ART_HISTORY_COURSE_OFFERINGS",
  "ASIAN_AMERICAN_STUDIES_COURSE_OFFERINGS",
  "CLASSICS_COURSE_OFFERINGS",
  "EAST_ASIAN_STUDIES_COURSE_OFFERINGS",
  "FILM_MEDIA_STUDIES_COURSE_OFFERINGS",
  "GENDER_SEXUALITY_STUDIES_COURSE_OFFERINGS",
  "HISTORY_COURSE_OFFERINGS",
  "PHILOSOPHY_MEDICAL_HUMANITIES_COURSE_OFFERINGS",
  "RELIGIOUS_STUDIES_COURSE_OFFERINGS",
  "SPANISH_PORTUGUESE_COURSE_OFFERINGS",
] as const;
export const HUMANITIES_SOURCE_IDS = [
  ...HUMANITIES_PDF_SOURCE_IDS,
  "ENGLISH_COURSE_OFFERINGS",
  "GLOBAL_LANGUAGES_CULTURES_COURSE_OFFERINGS",
] as const;
export type HumanitiesSource =
  | (typeof HUMANITIES_SOURCE_IDS)[number]
  | "COMPARATIVE_LITERATURE_COURSE_OFFERINGS";
export type HumanitiesPdfSource = (typeof HUMANITIES_PDF_SOURCE_IDS)[number];

type Quarter = "Fall" | "Winter" | "Spring";
type PdfItem = { str: string; x: number; y: number };
export type PdfLine = { y: number; items: PdfItem[]; text: string };
export type ParsedHumanitiesOffering = {
  source: HumanitiesSource;
  sourceUrl: string;
  academicYear: string;
  courseId: string;
  year: string;
  quarter: Quarter;
  instructors: string[];
};
export type ParsedHumanitiesSource = {
  source: HumanitiesSource;
  sourceUrl: string;
  academicYear: string;
  lastUpdated: Date | null;
  terms: Array<{ year: string; quarter: Quarter }>;
  offerings: ParsedHumanitiesOffering[];
  rowsParsed: number;
  duplicateRowsCollapsed: number;
  parsingErrors: string[];
};

export const HUMANITIES_SOURCE_URLS: Record<HumanitiesSource, string> = {
  AFRICAN_AMERICAN_STUDIES_COURSE_OFFERINGS:
    "https://sites.uci.edu/humsched/files/2026/05/AFAM-2026.pdf",
  ARMENIAN_STUDIES_COURSE_OFFERINGS:
    "https://sites.uci.edu/humsched/files/2026/05/ARMN-STU-2026.pdf",
  ART_HISTORY_COURSE_OFFERINGS: "https://sites.uci.edu/humsched/files/2026/06/AH-SCHED_2026.pdf",
  ASIAN_AMERICAN_STUDIES_COURSE_OFFERINGS:
    "https://sites.uci.edu/humsched/files/2026/05/ASAM-2026.pdf",
  CLASSICS_COURSE_OFFERINGS: "https://sites.uci.edu/humsched/files/2026/05/CLASSICS-2026.pdf",
  EAST_ASIAN_STUDIES_COURSE_OFFERINGS:
    "https://sites.uci.edu/humsched/files/2026/06/EAS-SCHED_2026.pdf",
  FILM_MEDIA_STUDIES_COURSE_OFFERINGS: "https://sites.uci.edu/humsched/files/2026/05/FMS-2026.pdf",
  GENDER_SEXUALITY_STUDIES_COURSE_OFFERINGS:
    "https://sites.uci.edu/humsched/files/2026/06/GSS-SCHED_2026.pdf",
  HISTORY_COURSE_OFFERINGS: "https://sites.uci.edu/humsched/files/2026/05/HISTORY-2026.pdf",
  PHILOSOPHY_MEDICAL_HUMANITIES_COURSE_OFFERINGS:
    "https://sites.uci.edu/humsched/files/2026/05/PHILOS-MEDHUM-2026-1.pdf",
  RELIGIOUS_STUDIES_COURSE_OFFERINGS:
    "https://sites.uci.edu/humsched/files/2026/05/REL-STU-2026.pdf",
  SPANISH_PORTUGUESE_COURSE_OFFERINGS: "https://sites.uci.edu/humsched/files/2026/05/LAIC-2026.pdf",
  COMPARATIVE_LITERATURE_COURSE_OFFERINGS:
    "https://sites.uci.edu/humsched/files/2026/05/COM-LIT-2026.pdf",
  ENGLISH_COURSE_OFFERINGS: "https://canva.link/qttxux0qiyh3p3k",
  GLOBAL_LANGUAGES_CULTURES_COURSE_OFFERINGS:
    "https://www.humanities.uci.edu/glc/language-programs-overview",
};

export const GLOBAL_LANGUAGES_CULTURES_PAGE_URLS = {
  ARABIC:
    "https://www.humanities.uci.edu/glc/language-programs-overview/arabic-course-descriptions",
  PERSIAN:
    "https://www.humanities.uci.edu/glc/language-programs-overview/persian-course-descriptions",
  VIETMSE:
    "https://www.humanities.uci.edu/glc/language-programs-overview/vietnamese-course-descriptions",
} as const;

const canonicalDepartments: Record<string, string> = {
  AFAM: "AFAM",
  ARMN: "ARMN",
  "ART HIS": "ARTHIS",
  ASAM: "ASIANAM",
  CLASSIC: "CLASSIC",
  GREEK: "GREEK",
  LATIN: "LATIN",
  EAS: "EAS",
  CH: "CHINESE",
  JPN: "JAPANSE",
  FMS: "FLM&MDA",
  GSS: "GEN&SEX",
  HISTORY: "HISTORY",
  PHILOS: "PHILOS",
  "MED HUM": "MEDHUM",
  "REL STD": "RELSTD",
  SPANISH: "SPANISH",
  "COM LIT": "COMLIT",
  ENGLISH: "ENGLISH",
  "LIT JRN": "LITJRN",
  WR: "WRITING",
  ARABIC: "ARABIC",
  PERSIAN: "PERSIAN",
  VIETMSE: "VIETMSE",
};

const normalize = (value: string) =>
  value
    .normalize("NFKC")
    .replaceAll(/[\u200B-\u200D\u2060\uFEFF]/g, "")
    .replaceAll(/[\s\p{Z}]+/gu, " ")
    .trim();

export function normalizeHumanitiesCourseId(
  department: string,
  courseNumber: string,
): string | null {
  const dept = normalize(department).toUpperCase().replace(/\s+/g, " ");
  const canonical = canonicalDepartments[dept];
  const number = normalize(courseNumber).toUpperCase().replace(/\s+/g, "");
  if (!canonical || !/^(?:H?\d+[A-Z]*)$/.test(number)) return null;
  return `${canonical}${number}`;
}

function sourceKind(source: HumanitiesPdfSource): string {
  switch (source) {
    case "AFRICAN_AMERICAN_STUDIES_COURSE_OFFERINGS":
      return "AFAM";
    case "ARMENIAN_STUDIES_COURSE_OFFERINGS":
      return "ARMN";
    case "ART_HISTORY_COURSE_OFFERINGS":
      return "ART HIS";
    case "ASIAN_AMERICAN_STUDIES_COURSE_OFFERINGS":
      return "ASAM";
    case "CLASSICS_COURSE_OFFERINGS":
      return "CLASSIC";
    case "EAST_ASIAN_STUDIES_COURSE_OFFERINGS":
      return "EAS";
    case "FILM_MEDIA_STUDIES_COURSE_OFFERINGS":
      return "FMS";
    case "GENDER_SEXUALITY_STUDIES_COURSE_OFFERINGS":
      return "GSS";
    case "HISTORY_COURSE_OFFERINGS":
      return "HISTORY";
    case "PHILOSOPHY_MEDICAL_HUMANITIES_COURSE_OFFERINGS":
      return "PHILOS";
    case "RELIGIOUS_STUDIES_COURSE_OFFERINGS":
      return "REL STD";
    case "SPANISH_PORTUGUESE_COURSE_OFFERINGS":
      return "SPANISH";
  }
}

function termForQuarter(quarter: Quarter): { quarter: Quarter; year: string } {
  return quarter === "Fall" ? { quarter: "Fall", year: "2026" } : { quarter, year: "2027" };
}

function parseDate(lines: PdfLine[]): Date | null {
  const text = lines.map((line) => line.text).join(" ");
  const match =
    text.match(/(?:last updated?|update)\s*:?\s*([A-Za-z]+\s+\d{1,2},\s+20\d{2})/i) ??
    text.match(/\b(\d{1,2}\/\d{1,2}\/20\d{2})\b/);
  if (!match) return null;
  const date = new Date(`${match[1]} UTC`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function termFromText(text: string): { quarter: Quarter; year: string } | null {
  const match = text.match(/\b(FALL|WINTER|SPRING)\s+(20\d{2})\b/i);
  if (!match) return null;
  const quarter = `${match[1][0]}${match[1].slice(1).toLowerCase()}` as Quarter;
  const expected = quarter === "Fall" ? "2026" : "2027";
  return match[2] === expected ? { quarter, year: match[2] } : null;
}

function plainTermFromText(text: string): { quarter: Quarter; year: string } | null {
  const match = text.match(/^\s*(?:[_| ]+)?(FALL|WINTER|SPRING)(?:\s+(20\d{2}))?/i);
  if (!match) return null;
  const quarter = `${match[1][0]}${match[1].slice(1).toLowerCase()}` as Quarter;
  const year = match[2] ?? (quarter === "Fall" ? "2026" : "2027");
  return { quarter, year };
}

function decodeHtmlCell(value: string): string {
  return normalize(
    value
      .replace(/<br\s*\/?>/gi, " ")
      .replace(/<[^>]*>/g, " ")
      .replace(/&nbsp;/gi, " ")
      .replace(/&amp;/gi, "&")
      .replace(/&quot;/gi, '"')
      .replace(/&#39;/gi, "'")
      .replace(/&#x([0-9a-f]+);/gi, (_, code: string) =>
        String.fromCodePoint(Number.parseInt(code, 16)),
      )
      .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number.parseInt(code, 10))),
  );
}

type GlobalLanguagesCulturesPage = { department: string; html: string };

/**
 * Parse the three public GLC language tables. The pages are labelled "Course
 * Descriptions", but their AY heading and F26/W27/S27 rows are explicit
 * planned offerings. STAFF and other non-person placeholders intentionally
 * produce an empty instructor list.
 */
export function parseGlobalLanguagesCulturesPages(
  pages: GlobalLanguagesCulturesPage[],
): ParsedHumanitiesSource {
  const source: HumanitiesSource = "GLOBAL_LANGUAGES_CULTURES_COURSE_OFFERINGS";
  const offeringsByKey = new Map<string, ParsedHumanitiesOffering>();
  const parsingErrors: string[] = [];
  const terms = new Map<string, { year: string; quarter: Quarter }>();
  let rowsParsed = 0;
  let duplicateRowsCollapsed = 0;
  const academicYears = new Set<string>();

  for (const page of pages) {
    const pageText = decodeHtmlCell(page.html.replace(/<script[\s\S]*?<\/script>/gi, " "));
    const yearMatch = pageText.match(/\bAY:\s*(20\d{2})\s*[-–—]\s*(20\d{2})\b/i);
    if (yearMatch) academicYears.add(`${yearMatch[1]}-${yearMatch[2]}`);
    const rows = Array.from(page.html.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi));
    for (const rowMatch of rows) {
      const cells = Array.from(rowMatch[1].matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi)).map(
        (match) => decodeHtmlCell(match[1]),
      );
      if (cells.length < 2) continue;
      const termMatch = cells[0].match(/^([A-Z]+)\s*\(\s*([FWS])\s*((?:20\d{2}|\d{2}))\s*\)$/i);
      if (!termMatch) continue;
      const department = termMatch[1].toUpperCase();
      if (!(department in canonicalDepartments)) {
        parsingErrors.push(`GLC row has unsupported department '${department}'`);
        continue;
      }
      const quarter = ({ F: "Fall", W: "Winter", S: "Spring" } as const)[
        termMatch[2].toUpperCase() as "F" | "W" | "S"
      ];
      const rawYear = termMatch[3];
      const year = rawYear.length === 2 ? `20${rawYear}` : rawYear;
      terms.set(`${year}|${quarter}`, { year, quarter });
      rowsParsed += 1;
      const numberMatch = cells[1].match(/^(H?\d+[A-Z]*)\b/i);
      const number = courseNumberFromToken(numberMatch?.[1] ?? "");
      if (!number) {
        parsingErrors.push(`GLC ${department} ${cells[1]} has malformed course number`);
        continue;
      }
      const courseId = normalizeHumanitiesCourseId(department, number);
      if (!courseId) {
        parsingErrors.push(`GLC ${department} ${number} could not be normalized`);
        continue;
      }
      const instructors = likelyInstructor(cells.at(-1) ?? "");
      const key = `${courseId}|${year}|${quarter}`;
      const existing = offeringsByKey.get(key);
      if (existing) {
        existing.instructors = Array.from(new Set([...existing.instructors, ...instructors]));
        duplicateRowsCollapsed += 1;
      } else {
        offeringsByKey.set(key, {
          source,
          sourceUrl: HUMANITIES_SOURCE_URLS[source],
          academicYear: HUMANITIES_ACADEMIC_YEAR,
          courseId,
          year,
          quarter,
          instructors,
        });
      }
    }
  }
  if (academicYears.size !== 1 || !academicYears.has(HUMANITIES_ACADEMIC_YEAR))
    parsingErrors.push("GLC pages did not consistently identify academic year 2026-2027");
  for (const [quarter, expectedYear] of [
    ["Fall", "2026"],
    ["Winter", "2027"],
    ["Spring", "2027"],
  ] as const) {
    if (!terms.has(`${expectedYear}|${quarter}`))
      parsingErrors.push(`GLC pages are missing required ${quarter} ${expectedYear} term`);
  }
  if (pages.length !== 3) parsingErrors.push("GLC source did not provide all three language pages");
  return {
    source,
    sourceUrl: HUMANITIES_SOURCE_URLS[source],
    academicYear: HUMANITIES_ACADEMIC_YEAR,
    lastUpdated: null,
    terms: Array.from(terms.values()),
    offerings: Array.from(offeringsByKey.values()),
    rowsParsed,
    duplicateRowsCollapsed,
    parsingErrors,
  };
}

function academicYear(lines: PdfLine[]): string {
  const text = lines.map((line) => line.text).join(" ");
  const match = text.match(/(20\d{2})\s*[-–—]\s*(20\d{2}|\d{2})/);
  if (match) {
    const end = match[2].length === 2 ? `${match[1].slice(0, 2)}${match[2]}` : match[2];
    if (Number(end) === Number(match[1]) + 1) return `${match[1]}-${end}`;
  }
  return HUMANITIES_ACADEMIC_YEAR;
}

function addToken(
  list: ParsedHumanitiesOffering[],
  source: HumanitiesSource,
  term: { quarter: Quarter; year: string },
  department: string,
  number: string,
  instructors: string[] = [],
): boolean {
  const courseId = normalizeHumanitiesCourseId(department, number);
  if (!courseId) return false;
  const existing = list.find(
    (offering) =>
      offering.courseId === courseId &&
      offering.quarter === term.quarter &&
      offering.year === term.year,
  );
  if (existing) {
    existing.instructors = Array.from(new Set([...existing.instructors, ...instructors]));
    return false;
  }
  list.push({
    source,
    sourceUrl: HUMANITIES_SOURCE_URLS[source],
    academicYear: HUMANITIES_ACADEMIC_YEAR,
    courseId,
    year: term.year,
    quarter: term.quarter,
    instructors: Array.from(new Set(instructors)),
  });
  return true;
}

function likelyInstructor(value: string): string[] {
  const normalized = normalize(value);
  if (!normalized) return [];
  if (/^(?:\?|tba|tbd)$/i.test(normalized)) return ["TBD"];
  if (/^(?:staff|department staff|instructor tba)(?:\/|$)/i.test(normalized)) return [];
  if (/^offered by\b/i.test(normalized)) return [];
  return normalized
    .split(/\s*\/\s*/)
    .map(normalize)
    .filter(Boolean);
}

function delimitedInstructor(line: PdfLine, marker: string): string[] {
  const values = line.items.map((item) => normalize(item.str)).filter(Boolean);
  const markerIndex = values.findIndex(
    (value, index) => index > 1 && value.toUpperCase() === marker.toUpperCase(),
  );
  const candidate = markerIndex > 0 ? values[markerIndex - 1] : "";
  return /[,.'?]/.test(candidate) || /^(?:TBD|TBA)$/i.test(candidate)
    ? likelyInstructor(candidate)
    : [];
}

function courseNumberFromToken(value: string): string | null {
  const number = normalize(value).toUpperCase().replace(/\s+/g, "");
  return /^(?:H?\d+[A-Z]*)$/.test(number) ? number : null;
}

function parseSectioned(source: HumanitiesPdfSource, lines: PdfLine[]): ParsedHumanitiesOffering[] {
  const offerings: ParsedHumanitiesOffering[] = [];
  let term: { quarter: Quarter; year: string } | null = null;
  const kind = sourceKind(source);
  for (const line of lines) {
    const header = termFromText(line.text) ?? plainTermFromText(line.text);
    if (header) {
      term = header;
      continue;
    }
    if (!term) continue;
    const values = line.items.map((item) => normalize(item.str)).filter(Boolean);
    if (source === "HISTORY_COURSE_OFFERINGS") {
      for (const value of values) {
        const match = value.match(/^(\d+[A-Z]*(?:\/\d+[A-Z]*)?)$/i);
        if (!match) continue;
        for (const number of match[1].split("/"))
          addToken(offerings, source, term, "HISTORY", number);
      }
      continue;
    }
    if (source === "FILM_MEDIA_STUDIES_COURSE_OFFERINGS") continue;
    if (source === "PHILOSOPHY_MEDICAL_HUMANITIES_COURSE_OFFERINGS") {
      const token = line.text.match(/(?:^|\|)\s*PHILOS\s*\|\s*(H?\d+[A-Z]*)\b/i);
      if (token)
        addToken(offerings, source, term, "PHILOS", token[1], delimitedInstructor(line, "PHILOS"));
      continue;
    }
    if (source === "RELIGIOUS_STUDIES_COURSE_OFFERINGS") {
      const token = line.text.match(/REL\s+STD\s+(?:\|\s*)?(H?\d+[A-Z]*)\b/i);
      if (token) addToken(offerings, source, term, "REL STD", token[1]);
      continue;
    }
    const pattern = new RegExp(
      `(?:^|\\|)\\s*${kind.replace(" ", "\\s+")}\\s+(?:\\|\\s*)?(H?\\d+[A-Z]*)\\b`,
      "ig",
    );
    for (const match of line.text.matchAll(pattern)) {
      const number = courseNumberFromToken(match[1]);
      if (number) {
        const instructors =
          source === "ASIAN_AMERICAN_STUDIES_COURSE_OFFERINGS"
            ? delimitedInstructor(line, "Asian American Studies")
            : source === "ART_HISTORY_COURSE_OFFERINGS"
              ? delimitedInstructor(line, "Art His")
              : source === "GENDER_SEXUALITY_STUDIES_COURSE_OFFERINGS"
                ? delimitedInstructor(line, "GSS")
                : source === "CLASSICS_COURSE_OFFERINGS"
                  ? delimitedInstructor(line, "Classics")
                  : [];
        addToken(offerings, source, term, kind, number, instructors);
      }
    }
  }
  return offerings;
}

function parseColumnar(source: HumanitiesPdfSource, lines: PdfLine[]): ParsedHumanitiesOffering[] {
  const offerings: ParsedHumanitiesOffering[] = [];
  const addByX = (x: number, dept: string, number: string, instructors: string[] = []) => {
    const term =
      x < 240
        ? termForQuarter("Fall")
        : x < 490
          ? termForQuarter("Winter")
          : termForQuarter("Spring");
    addToken(offerings, source, term, dept, number, instructors);
  };
  for (const line of lines) {
    if (source === "AFRICAN_AMERICAN_STUDIES_COURSE_OFFERINGS") {
      for (const item of line.items) {
        const match = item.str.match(/^AFAM\s+(H?\d+[A-Z]*)\.?$/i);
        if (match) {
          const term =
            item.x < 130
              ? termForQuarter("Fall")
              : item.x < 250
                ? termForQuarter("Winter")
                : termForQuarter("Spring");
          const lineIndex = lines.indexOf(line);
          const nextCourseIndex = lines.findIndex(
            (candidate, index) =>
              index > lineIndex &&
              candidate.items.some(
                (value) =>
                  Math.abs(value.x - item.x) < 3 && /^AFAM\s+(?:H?\d+[A-Z]*)/i.test(value.str),
              ),
          );
          const block = lines.slice(
            lineIndex + 1,
            nextCourseIndex < 0 ? lines.length : nextCourseIndex,
          );
          const candidates = block
            .flatMap((candidate) =>
              candidate.items
                .filter((value) => Math.abs(value.x - item.x) < 3)
                .map((value) => value.str),
            )
            .filter((value) => !/^AFAM\s|^XL:|^Cap:|^\d+$|^[A-Z& ]+\s+\d/i.test(normalize(value)));
          const instructor = candidates.length > 0 ? likelyInstructor(candidates.at(-1) ?? "") : [];
          addToken(offerings, source, term, "AFAM", match[1], instructor);
        }
      }
      continue;
    }
    if (source === "FILM_MEDIA_STUDIES_COURSE_OFFERINGS") {
      if (/^(?:Course No|Course Title|UNDERGRADUATE|GRADUATE)$/i.test(line.text)) continue;
      for (const item of line.items) {
        const number = courseNumberFromToken(item.str);
        if (number) addByX(item.x, "FMS", number);
      }
      continue;
    }
    if (source === "SPANISH_PORTUGUESE_COURSE_OFFERINGS") {
      for (let index = 0; index < line.items.length; index += 1) {
        const item = line.items[index];
        if (!/^\*?Spanish$/i.test(normalize(item.str))) continue;
        const number = courseNumberFromToken(line.items[index + 1]?.str ?? "");
        if (!number) continue;
        const suffix = normalize(line.items[index + 2]?.str ?? "");
        const full = /^[A-Z]{1,3}$/.test(suffix) ? `${number}${suffix}` : number;
        addByX(item.x, "SPANISH", full);
      }
    }
  }
  return offerings;
}

function parseEastAsian(lines: PdfLine[]): ParsedHumanitiesOffering[] {
  const source: HumanitiesSource = "EAST_ASIAN_STUDIES_COURSE_OFFERINGS";
  const offerings: ParsedHumanitiesOffering[] = [];
  let faculty: string | null = null;
  for (const line of lines) {
    const facultyItem = line.items.find(
      (item) =>
        item.x < 120 &&
        !/^(?:Tentative|Last Update|Senate Faculty|Unit 18 Faculty)$/i.test(normalize(item.str)),
    );
    if (facultyItem && !/^(?:Research|Sabbatical)$/i.test(normalize(facultyItem.str)))
      faculty = normalize(facultyItem.str);
    if (/^Unit 18 Faculty$/i.test(line.text)) faculty = null;
    for (const item of line.items) {
      const match = normalize(item.str).match(
        /\b(EAS|CH|JPN)(?:\/FMS)?\s+(H?\d+[A-Z]*(?:\s*\/\s*[A-Z]?\d+[A-Z]*)*)/i,
      );
      if (!match) continue;
      const term =
        item.x < 250
          ? termForQuarter("Fall")
          : item.x < 420
            ? termForQuarter("Winter")
            : termForQuarter("Spring");
      const dept = match[1].toUpperCase();
      for (const number of match[2].split("/").map((value) => value.trim())) {
        if (!/\d/.test(number)) continue;
        addToken(offerings, source, term, dept, number, faculty ? [faculty] : []);
      }
    }
  }
  return offerings;
}

function parseMedicalHumanities(lines: PdfLine[], offerings: ParsedHumanitiesOffering[]): void {
  const source: HumanitiesSource = "PHILOSOPHY_MEDICAL_HUMANITIES_COURSE_OFFERINGS";
  for (const line of lines) {
    const match = line.text.match(
      /Med\s+Hum\s*\|?\s*(\d+)\s*\|\s*(Fall|Spr(?:ing)?)\s+20(26|27)\s*\|?\s*(.*)$/i,
    );
    if (!match) continue;
    const quarter = /^fall/i.test(match[2]) ? "Fall" : "Spring";
    const year = quarter === "Fall" ? "2026" : "2027";
    addToken(offerings, source, { quarter, year }, "MED HUM", match[1], likelyInstructor(match[4]));
  }
}

export function parseHumanitiesPdfLines(
  source: HumanitiesPdfSource,
  lines: PdfLine[],
): ParsedHumanitiesSource {
  const offerings =
    source === "EAST_ASIAN_STUDIES_COURSE_OFFERINGS"
      ? parseEastAsian(lines)
      : source === "AFRICAN_AMERICAN_STUDIES_COURSE_OFFERINGS" ||
          source === "FILM_MEDIA_STUDIES_COURSE_OFFERINGS" ||
          source === "SPANISH_PORTUGUESE_COURSE_OFFERINGS"
        ? parseColumnar(source, lines)
        : parseSectioned(source, lines);
  if (source === "PHILOSOPHY_MEDICAL_HUMANITIES_COURSE_OFFERINGS")
    parseMedicalHumanities(lines, offerings);
  const terms = Array.from(
    new Map(
      offerings.map((offering) => [
        `${offering.year} ${offering.quarter}`,
        { year: offering.year, quarter: offering.quarter },
      ]),
    ).values(),
  );
  return {
    source,
    sourceUrl: HUMANITIES_SOURCE_URLS[source],
    academicYear: academicYear(lines),
    lastUpdated: parseDate(lines),
    terms,
    offerings,
    rowsParsed: offerings.length,
    duplicateRowsCollapsed: 0,
    parsingErrors:
      terms.length < 3 ? [`${source} did not expose all Fall/Winter/Spring terms`] : [],
  };
}

export async function extractHumanitiesPdfLines(bytes: Uint8Array): Promise<PdfLine[]> {
  const document = await getDocument({
    data: bytes,
    disableWorker: true,
    isEvalSupported: false,
  } as never).promise;
  const lines: PdfLine[] = [];
  for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
    const content = await (await document.getPage(pageNumber)).getTextContent({
      disableCombineTextItems: true,
    } as never);
    const items = content.items
      .filter(
        (item): item is typeof item & { str: string; transform: number[] } =>
          "str" in item && Boolean(item.str.trim()),
      )
      .map((item) => ({
        str: item.str,
        x: item.transform[4],
        y: item.transform[5],
      }))
      .sort((a, b) => (Math.abs(a.y - b.y) < 1 ? a.x - b.x : b.y - a.y));
    for (const item of items) {
      const line = lines.at(-1);
      if (!line || Math.abs(line.y - item.y) > 1)
        lines.push({ y: item.y, items: [item], text: item.str });
      else {
        line.items.push(item);
        line.text = line.items.map((value) => value.str).join(" | ");
      }
    }
  }
  return lines;
}

export async function parseHumanitiesPdf(
  source: HumanitiesSource,
  bytes: Uint8Array,
): Promise<ParsedHumanitiesSource> {
  if (source === "GLOBAL_LANGUAGES_CULTURES_COURSE_OFFERINGS")
    throw new Error("GLC schedules are HTML pages, not a PDF source");
  if (source === "COMPARATIVE_LITERATURE_COURSE_OFFERINGS")
    throw new Error("Comparative Literature OCR is handled by the higher-memory Node importer");
  if (source === "ENGLISH_COURSE_OFFERINGS")
    return parseEnglishCanvaHtml(new TextDecoder().decode(bytes));
  return parseHumanitiesPdfLines(source, await extractHumanitiesPdfLines(bytes));
}

const ENGLISH_CANVA_DESIGN_ID = "DAHGGfFVuNM";

function decodeJavaScriptString(value: string): string {
  let output = "";
  for (let index = 0; index < value.length; index += 1) {
    if (value[index] !== "\\") {
      output += value[index];
      continue;
    }
    const next = value[++index];
    if (next === "u") {
      output += String.fromCharCode(Number.parseInt(value.slice(index + 1, index + 5), 16));
      index += 4;
    } else if (next === "n") output += "\n";
    else if (next === "r") output += "\r";
    else if (next === "t") output += "\t";
    else if (next === "b") output += "\b";
    else if (next === "f") output += "\f";
    else output += next;
  }
  return output;
}

function canvaBootstrap(html: string): Record<string, unknown> {
  const marker = "window['bootstrap'] = JSON.parse('",
    start = html.indexOf(marker);
  if (start < 0) throw new Error("Canva bootstrap JSON was not found");
  const contentStart = start + marker.length;
  const contentEnd = html.indexOf("'); window['flags']", contentStart);
  if (contentEnd < 0) throw new Error("Canva bootstrap JSON terminator was not found");
  return JSON.parse(decodeJavaScriptString(html.slice(contentStart, contentEnd))) as Record<
    string,
    unknown
  >;
}

function canvaCellText(row: unknown): string {
  if (!row || typeof row !== "object") return "";
  const value = (row as { A?: { A?: unknown } }).A?.A;
  return typeof value === "string" ? normalize(value) : "";
}

export function parseEnglishCanvaHtml(html: string): ParsedHumanitiesSource {
  const source: HumanitiesSource = "ENGLISH_COURSE_OFFERINGS";
  const bootstrap = canvaBootstrap(html);
  const page = bootstrap.page as
    | { Bj?: { A?: { D?: { A?: { A?: Array<{ r?: unknown[] }> } } } } }
    | undefined;
  const pages = page?.Bj?.A?.D?.A?.A ?? [];
  const offerings: ParsedHumanitiesOffering[] = [];
  const parsingErrors: string[] = [];
  let quarter: Quarter | null = null;
  let academicYear = HUMANITIES_ACADEMIC_YEAR;
  let lastUpdated: Date | null = null;
  let rowsParsed = 0;
  let duplicateRowsCollapsed = 0;
  for (const pageData of pages) {
    const cells = (pageData.r ?? []).map(canvaCellText);
    let pending: {
      department: string;
      number: string;
      fields: string[];
    } | null = null;
    const flush = () => {
      if (!pending || !quarter) return;
      rowsParsed += 1;
      const term = termForQuarter(quarter);
      const courseId = normalizeHumanitiesCourseId(pending.department, pending.number);
      if (!courseId) {
        parsingErrors.push(
          `Unable to normalize English schedule course ${pending.department} ${pending.number}`,
        );
        pending = null;
        return;
      }
      const instructors = likelyInstructor(pending.fields[2] ?? "");
      const existing = offerings.find(
        (offering) =>
          offering.courseId === courseId &&
          offering.year === term.year &&
          offering.quarter === term.quarter,
      );
      if (existing) {
        existing.instructors = Array.from(new Set([...existing.instructors, ...instructors]));
        duplicateRowsCollapsed += 1;
      } else
        offerings.push({
          source,
          sourceUrl: HUMANITIES_SOURCE_URLS[source],
          academicYear,
          courseId,
          year: term.year,
          quarter: term.quarter,
          instructors,
        });
      pending = null;
    };
    for (const cell of cells) {
      if (!cell) continue;
      const date = cell.match(/last\s+updated\s+.*?(\w+\s+\d{1,2},\s+20\d{2})/i);
      if (date) {
        const parsed = new Date(`${date[1]} UTC`);
        if (!Number.isNaN(parsed.getTime())) lastUpdated = parsed;
        continue;
      }
      const year = cell.match(/(20\d{2})\s*[-–—]\s*(20\d{2})/);
      if (year && Number(year[2]) === Number(year[1]) + 1) academicYear = `${year[1]}-${year[2]}`;
      const header = cell.match(/^(Fall|Winter|Spring)\s+(20\d{2})$/i);
      if (header) {
        flush();
        quarter = `${header[1][0].toUpperCase()}${header[1].slice(1).toLowerCase()}` as Quarter;
        const expected = quarter === "Fall" ? "2026" : "2027";
        if (header[2] !== expected) parsingErrors.push(`Unexpected English term year ${cell}`);
        continue;
      }
      const course = cell.match(/^(English|Lit\s+Jrn|WR)\s+([A-Z]?\d+[A-Z]*)$/i);
      if (course) {
        flush();
        pending = { department: course[1], number: course[2], fields: [] };
        continue;
      }
      if (pending) pending.fields.push(cell);
    }
    flush();
  }
  const terms = Array.from(
    new Map(
      offerings.map((offering) => [
        `${offering.year}|${offering.quarter}`,
        { year: offering.year, quarter: offering.quarter },
      ]),
    ).values(),
  );
  if (terms.length < 3)
    parsingErrors.push("English Canva schedule did not expose all three quarters");
  return {
    source,
    sourceUrl: HUMANITIES_SOURCE_URLS[source],
    academicYear,
    lastUpdated,
    terms,
    offerings,
    rowsParsed,
    duplicateRowsCollapsed,
    parsingErrors,
  };
}

type KnownInstructor = { ucinetid: string; name: string; department: string };

function instructorNameMatches(source: string, known: string): boolean {
  const sourceValue = normalize(source).toLowerCase();
  const knownParts = normalize(known)
    .toLowerCase()
    .replace(/[.,]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
  const knownLast = knownParts.at(-1) ?? "";
  const knownFirst = knownParts[0] ?? "";
  const commaParts = sourceValue
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  if (commaParts.length > 0) {
    const last = commaParts[0].replace(/[^a-z]/g, "");
    const initial = commaParts[1]?.replace(/[^a-z]/g, "").charAt(0);
    if (last && knownLast === last) return !initial || knownFirst.startsWith(initial);
  }
  const sourceParts = sourceValue.replace(/[.,]/g, " ").split(/\s+/).filter(Boolean);
  if (sourceParts.length === 1) return knownLast === sourceParts[0];
  if (sourceParts[0].length === 1 && knownLast === sourceParts[1])
    return knownFirst.startsWith(sourceParts[0]);
  return sourceParts.every(
    (part, index) => knownParts[knownParts.length - sourceParts.length + index] === part,
  );
}

export function resolveHumanitiesInstructors(
  names: string[],
  known: KnownInstructor[],
): TentativeInstructor[] {
  const output: TentativeInstructor[] = [];
  for (const name of Array.from(new Set(names))) {
    if (name === "TBD") {
      output.push({ status: "tbd", name: "TBD", ucinetid: null });
      continue;
    }
    const candidates = known.filter((record) => instructorNameMatches(name, record.name));
    if (candidates.length === 1)
      output.push({
        status: "assigned",
        name,
        ucinetid: candidates[0].ucinetid,
      });
  }
  return output;
}

function scopeKey(value: { academicYear?: string; year: string; quarter: string }) {
  return `${value.academicYear ?? HUMANITIES_ACADEMIC_YEAR}|${value.year}|${value.quarter}`;
}
function offeringKey(value: {
  academicYear?: string;
  courseId: string;
  year: string;
  quarter: string;
}) {
  return `${scopeKey(value)}|${value.courseId}`;
}

async function fetchSource(source: HumanitiesSource, fetcher: typeof fetch): Promise<Uint8Array> {
  const headers: Record<string, string> =
    source === "ENGLISH_COURSE_OFFERINGS"
      ? {
          // Canva serves an intentionally reduced "Unsupported client" document to
          // generic bot user agents. This remains a public viewer response and
          // contains the structured design data used by parseEnglishCanvaHtml.
          "User-Agent":
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36",
          Accept: "text/html,application/xhtml+xml",
        }
      : { "User-Agent": "Anteater API Humanities scraper" };
  const response = await fetcher(HUMANITIES_SOURCE_URLS[source], {
    headers,
  });
  if (!response.ok)
    throw new Error(`Failed to fetch ${HUMANITIES_SOURCE_URLS[source]}: HTTP ${response.status}`);
  if (source === "ENGLISH_COURSE_OFFERINGS" && !isExpectedEnglishCanvaUrl(response.url))
    throw new Error(`English Canva link resolved to an unexpected design: ${response.url}`);
  return new Uint8Array(await response.arrayBuffer());
}

/** Fetch the public Canva viewer representation used by the English parser. */
export async function fetchEnglishCanvaHtml(fetcher: typeof fetch = fetch): Promise<string> {
  return new TextDecoder().decode(await fetchSource("ENGLISH_COURSE_OFFERINGS", fetcher));
}

export function isExpectedEnglishCanvaUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return (
      parsed.hostname === "www.canva.com" &&
      parsed.pathname.split("/").includes(ENGLISH_CANVA_DESIGN_ID)
    );
  } catch {
    return false;
  }
}

export async function loadHumanitiesSourceSafely<T>(
  source: HumanitiesSource,
  loadSource: () => Promise<T>,
  warn: (message: string) => void = console.warn,
): Promise<T | null> {
  try {
    return await loadSource();
  } catch (error) {
    warn(`Skipping Humanities source ${source}: ${(error as Error).message}`);
    return null;
  }
}

export type HumanitiesScrapeSummary = {
  sources: Array<
    ParsedHumanitiesSource & {
      matchedCourseIds: string[];
      unmatchedCourseIds: string[];
      rowsInserted: number;
      rowsUpdated: number;
      rowsDeactivated: number;
      resolvedInstructorAssignments: number;
    }
  >;
};

export async function doScrape(
  db: ReturnType<typeof database>,
  fetcher: typeof fetch = fetch,
  now = new Date(),
): Promise<HumanitiesScrapeSummary> {
  const results: HumanitiesScrapeSummary["sources"] = [];
  for (const source of HUMANITIES_SOURCE_IDS) {
    const parsed = await loadHumanitiesSourceSafely(source, async () => {
      if (source === "GLOBAL_LANGUAGES_CULTURES_COURSE_OFFERINGS") {
        const pages = await Promise.all(
          Object.entries(GLOBAL_LANGUAGES_CULTURES_PAGE_URLS).map(async ([department, url]) => {
            const response = await fetcher(url, {
              headers: { "User-Agent": "Anteater API Humanities scraper" },
            });
            if (!response.ok) throw new Error(`Failed to fetch ${url}: HTTP ${response.status}`);
            return { department, html: await response.text() };
          }),
        );
        return parseGlobalLanguagesCulturesPages(pages);
      } else {
        if (source === "ENGLISH_COURSE_OFFERINGS")
          return parseEnglishCanvaHtml(await fetchEnglishCanvaHtml(fetcher));
        const bytes = await fetchSource(source, fetcher);
        return await parseHumanitiesPdf(source, bytes);
      }
    });
    if (!parsed) continue;
    const allIds = Array.from(new Set(parsed.offerings.map((offering) => offering.courseId)));
    const [knownCourses, knownInstructors, calendarTerms] = await Promise.all([
      db.select({ id: course.id }).from(course).where(inArray(course.id, allIds)),
      db
        .select({
          ucinetid: instructor.ucinetid,
          name: instructor.name,
          department: instructor.department,
        })
        .from(instructor)
        .where(ne(instructor.ucinetid, "student")),
      db
        .select({
          year: calendarTerm.year,
          quarter: calendarTerm.quarter,
          instructionStart: calendarTerm.instructionStart,
        })
        .from(calendarTerm)
        .where(inArray(calendarTerm.year, ["2026", "2027"])),
    ]);
    const futureTerms = new Set(
      calendarTerms
        .filter((value) => value.instructionStart > now)
        .map((value) => `${value.year}|${value.quarter}`),
    );
    const offerings = parsed.offerings.filter((offering) =>
      futureTerms.has(`${offering.year}|${offering.quarter}`),
    );
    const terms = parsed.terms.filter((term) => futureTerms.has(`${term.year}|${term.quarter}`));
    const ids = Array.from(new Set(offerings.map((offering) => offering.courseId)));
    const known = new Set(knownCourses.map(({ id }) => id));
    const matchedCourseIds = ids.filter((id) => known.has(id));
    const unmatchedCourseIds = ids.filter((id) => !known.has(id));
    const values = offerings
      .filter((offering) => known.has(offering.courseId))
      .map((offering) => ({
        source,
        sourceUrl: parsed.sourceUrl,
        academicYear: parsed.academicYear,
        courseId: offering.courseId,
        year: offering.year,
        quarter: offering.quarter as Term,
        instructors: resolveHumanitiesInstructors(offering.instructors, knownInstructors),
        lastUpdated: parsed.lastUpdated,
      }));
    const currentScopes = terms.filter((term) => term.year === "2026" || term.year === "2027");
    const existing = await db
      .select({
        academicYear: tentativeCourseOffering.academicYear,
        courseId: tentativeCourseOffering.courseId,
        year: tentativeCourseOffering.year,
        quarter: tentativeCourseOffering.quarter,
      })
      .from(tentativeCourseOffering)
      .where(
        and(
          eq(tentativeCourseOffering.source, source),
          eq(tentativeCourseOffering.academicYear, parsed.academicYear),
        ),
      );
    const existingKeys = new Set(existing.map((row) => `${scopeKey(row)}|${row.courseId}`));
    const currentKeys = new Set(offerings.map(offeringKey));
    const rowsInserted = values.filter((value) => !existingKeys.has(offeringKey(value))).length;
    const rowsUpdated = values.filter((value) => existingKeys.has(offeringKey(value))).length;
    const protectedIds = new Set(unmatchedCourseIds);
    const rowsDeactivated =
      parsed.parsingErrors.length === 0
        ? existing.filter(
            (row) =>
              currentScopes.some((scope) => scopeKey(scope) === scopeKey(row)) &&
              !currentKeys.has(`${scopeKey(row)}|${row.courseId}`) &&
              !protectedIds.has(row.courseId),
          ).length
        : 0;
    if (parsed.parsingErrors.length === 0 && currentScopes.length > 0)
      await db.transaction(async (tx) => {
        for (const scope of currentScopes) {
          const condition = and(
            eq(tentativeCourseOffering.source, source),
            eq(tentativeCourseOffering.academicYear, parsed.academicYear),
            eq(tentativeCourseOffering.year, scope.year),
            eq(tentativeCourseOffering.quarter, scope.quarter),
          );
          const keep = Array.from(
            new Set([
              ...unmatchedCourseIds,
              ...offerings
                .filter((offering) => scopeKey(offering) === scopeKey(scope))
                .map((offering) => offering.courseId),
            ]),
          );
          await tx
            .delete(tentativeCourseOffering)
            .where(
              keep.length > 0
                ? and(condition, notInArray(tentativeCourseOffering.courseId, keep))
                : condition,
            );
        }
        if (values.length > 0)
          await tx
            .insert(tentativeCourseOffering)
            .values(values)
            .onConflictDoUpdate({
              target: [
                tentativeCourseOffering.source,
                tentativeCourseOffering.academicYear,
                tentativeCourseOffering.courseId,
                tentativeCourseOffering.year,
                tentativeCourseOffering.quarter,
              ],
              set: conflictUpdateSetAllCols(tentativeCourseOffering),
            });
      });
    results.push({
      ...parsed,
      matchedCourseIds,
      unmatchedCourseIds,
      rowsInserted,
      rowsUpdated,
      rowsDeactivated,
      resolvedInstructorAssignments: values.reduce(
        (sum, value) =>
          sum + value.instructors.filter((instructor) => instructor.status === "assigned").length,
        0,
      ),
    });
  }
  const summary = { sources: results };
  console.log(JSON.stringify(summary));
  return summary;
}
