import type { database } from "@packages/db";
import { and, eq, inArray, ne, notInArray } from "@packages/db/drizzle";
import type { TentativeInstructor, Term } from "@packages/db/schema";
import { calendarTerm, course, instructor, tentativeCourseOffering } from "@packages/db/schema";
import { conflictUpdateSetAllCols } from "@packages/db/utils";
import { load } from "cheerio";

export const EDUCATION_COURSE_OFFERINGS_SOURCE = "EDUCATION_COURSE_OFFERINGS";
export const EDUCATION_COURSE_OFFERINGS_URL =
  "https://advise.education.uci.edu/tentative-course-schedule.html";
export const EDUCATION_PHD_COURSE_OFFERINGS_SOURCE = "EDUCATION_PHD_COURSE_OFFERINGS";
export const EDUCATION_PHD_COURSE_OFFERINGS_URL =
  "https://advise.education.uci.edu/phd-course-schedule.html";
const EDUCATION_PHD_SHEET_CSV_URL =
  "https://docs.google.com/spreadsheets/d/1RYbiaeymVl1YonDAhp-zexXWqREWaAYV55a0-4cpXkw/gviz/tq?tqx=out:csv&sheet=2026-2027%20AY";

const INCLUDED_QUARTERS = ["Fall", "Winter", "Spring"] as const;
type IncludedQuarter = (typeof INCLUDED_QUARTERS)[number];

export type ParsedEducationTerm = {
  header: string;
  academicYear: string;
  year: string;
  quarter: IncludedQuarter;
};

export type ParsedEducationCourseOffering = Omit<ParsedEducationTerm, "header"> & {
  courseId: string;
  instructors: [];
};

export type ParsedEducationCourseOfferingsPage = {
  sourceTableRows: number;
  courseEntriesByQuarter: Record<IncludedQuarter, number>;
  normalizedCourseEntries: number;
  duplicateTopicRowsCollapsed: number;
  displayedSourceUpdateValue: string | null;
  lastUpdated: null;
  courseIds: string[];
  offerings: ParsedEducationCourseOffering[];
  terms: ParsedEducationTerm[];
  academicYear: string;
  parsingErrors: string[];
};

export type EducationScrapeSummary = {
  sourceTableRows: number;
  courseEntriesByQuarter: Record<IncludedQuarter, number>;
  normalizedCourseEntries: number;
  uniqueOfferings: number;
  uniqueCourseIds: number;
  duplicateTopicRowsCollapsed: number;
  displayedSourceUpdateValue: string | null;
  matchedCourseIds: string[];
  unmatchedCourseIds: string[];
  rowsInserted: number;
  rowsUpdated: number;
  rowsDeactivated: number;
  skippedOrStaleTerms: string[];
  parsingErrors: string[];
};

export type ParsedEducationPhdCourseOffering = {
  academicYear: string;
  courseId: string;
  year: string;
  quarter: IncludedQuarter;
  instructors: string[];
};

export type ParsedEducationPhdCourseOfferingsPage = {
  sourceRowsParsed: number;
  normalizedCourseRows: number;
  instructorNamesParsed: number;
  duplicateRowsCollapsed: number;
  courseIds: string[];
  offerings: ParsedEducationPhdCourseOffering[];
  terms: ParsedEducationTerm[];
  academicYear: string;
  lastUpdated: Date | null;
  parsingErrors: string[];
};

export type EducationPhdScrapeSummary = ParsedEducationPhdCourseOfferingsPage & {
  uniqueOfferings: number;
  matchedCourseIds: string[];
  unmatchedCourseIds: string[];
  unresolvedInstructorNames: string[];
  rowsInserted: number;
  rowsUpdated: number;
  rowsDeactivated: number;
  skippedOrStaleTerms: string[];
};

type CalendarTermForImport = {
  year: string;
  quarter: Term;
  instructionStart: Date;
};

type ImportScope = Omit<ParsedEducationTerm, "header">;

type ImportableEducationOfferings = {
  offerings: ParsedEducationCourseOffering[];
  scopes: ImportScope[];
  skippedOrStaleTerms: string[];
};

const academicYearLabel = (startYear: number) => `${startYear}-${startYear + 1}`;

const termKey = (term: { year: string; quarter: string }) => `${term.year} ${term.quarter}`;

const scopeKey = (term: { academicYear: string; year: string; quarter: string }) =>
  `${term.academicYear}|${termKey(term)}`;

const offeringKey = (offering: ParsedEducationCourseOffering) =>
  `${scopeKey(offering)}|${offering.courseId}`;

const phdOfferingKey = (offering: ParsedEducationPhdCourseOffering) =>
  `${offering.academicYear}|${offering.year} ${offering.quarter}|${offering.courseId}`;

export function normalizeEducationText(value: string): string {
  return value
    .normalize("NFKC")
    .replaceAll(/[\u200B-\u200D\u2060\uFEFF]/g, "")
    .replaceAll(/[\s\p{Z}]+/gu, " ")
    .trim();
}

export function normalizeEducationCourseId(sourceCourseId: string): string | null {
  const normalized = normalizeEducationText(sourceCourseId.toUpperCase());
  // The official Ph.D. sheet consistently abbreviates EDUC as ED in a few
  // rows. Accept that department spelling only when it is followed by a
  // complete course number; arbitrary missing or partial identifiers remain
  // invalid.
  const match = normalized.match(/^(?:EDUC|ED)\s*([A-Z]*\d+[A-Z]*)$/);
  if (!match) return null;

  const numberMatch = match[1].match(/^([A-Z]*)(\d+)([A-Z]*)$/);
  if (!numberMatch) return null;
  const numeric = Number.parseInt(numberMatch[2], 10);
  if (!Number.isInteger(numeric)) return null;
  return `EDUC${numberMatch[1]}${numeric}${numberMatch[3]}`;
}

export function extractEducationCourseIds(value: string): string[] {
  const segments = value
    .normalize("NFKC")
    .replaceAll(/[\u200B-\u200D\u2060\uFEFF]/g, "")
    .split(/[\r\n|•]+/);
  const courseIds: string[] = [];

  for (const segment of segments) {
    const normalized = normalizeEducationText(segment);
    const match = normalized.match(/^[\p{P}\p{S}\s]*(EDUC\s*[A-Z]*\d+[A-Z]*)\b/iu);
    if (!match) continue;
    const courseId = normalizeEducationCourseId(match[1]);
    if (courseId) courseIds.push(courseId);
  }
  return courseIds;
}

export function isEducationPlaceholder(value: string): boolean {
  const normalized = normalizeEducationText(value);
  return normalized.length === 0 || /^[\p{P}\p{S}]+$/u.test(normalized);
}

export function parseEducationAcademicYear(html: string): {
  academicYear: string;
  startYear: number;
} {
  const $ = load(html);
  const headings = $("h1, h2, h3, h4, h5, h6")
    .toArray()
    .map((heading) => normalizeEducationText($(heading).text()));
  const heading = headings.find((value) => /^Tentative Course Schedule\s+20\d{2}/i.test(value));
  const match = heading?.match(
    /^Tentative Course Schedule\s+(20\d{2})\s*[-–—]\s*(20\d{2}|\d{2})$/i,
  );
  if (!match) {
    throw new Error("Education course offerings page did not contain a valid academic year");
  }

  const startYear = Number.parseInt(match[1], 10);
  const endYearValue = Number.parseInt(match[2], 10);
  const endYear =
    match[2].length === 2 ? Math.floor(startYear / 100) * 100 + endYearValue : endYearValue;
  if (endYear !== startYear + 1) {
    throw new Error(`Education listing has nonconsecutive academic year ${match[1]}-${match[2]}`);
  }
  return { academicYear: academicYearLabel(startYear), startYear };
}

export function parseEducationTermHeader(
  value: string,
  academicYear: string,
): ParsedEducationTerm | null {
  const header = normalizeEducationText(value);
  const match = header.match(/^(Fall|Winter|Spring)\s+(20\d{2})$/i);
  if (!match) return null;
  const quarter = `${match[1][0].toUpperCase()}${match[1]
    .slice(1)
    .toLocaleLowerCase()}` as IncludedQuarter;
  return { header, academicYear, year: match[2], quarter };
}

export function parseEducationDisplayedLastUpdated(html: string): string | null {
  const $ = load(html);
  const text = normalizeEducationText($.root().text());
  const match = text.match(/\bLast Updated:\s*(\d{2})\/(20\d{2})(?!\d)/i);
  if (!match) return null;
  const month = Number.parseInt(match[1], 10);
  return month >= 1 && month <= 12 ? `${match[1]}/${match[2]}` : null;
}

function emptyCourseEntryCounts(): Record<IncludedQuarter, number> {
  return { Fall: 0, Winter: 0, Spring: 0 };
}

export function parseEducationCourseOfferings(html: string): ParsedEducationCourseOfferingsPage {
  const $ = load(html);
  const { academicYear, startYear } = parseEducationAcademicYear(html);
  const offerings = new Map<string, ParsedEducationCourseOffering>();
  const courseIds = new Set<string>();
  const courseEntriesByQuarter = emptyCourseEntryCounts();
  const parsingErrors: string[] = [];
  let sourceTableRows = 0;
  let normalizedCourseEntries = 0;
  let duplicateTopicRowsCollapsed = 0;

  const tableCandidates = $("table")
    .toArray()
    .map((table) => {
      const headerCells = $(table).find("tr").first().children("th, td").toArray();
      const parsedHeaders = headerCells.map((cell, columnIndex) => ({
        columnIndex,
        term: parseEducationTermHeader($(cell).text(), academicYear),
      }));
      return {
        table,
        parsedHeaders,
        score: parsedHeaders.filter(({ term }) => term !== null).length,
      };
    })
    .filter(({ score }) => score > 0);

  const bestScore = Math.max(0, ...tableCandidates.map(({ score }) => score));
  const scheduleTables = tableCandidates.filter(({ score }) => score === bestScore);
  if (scheduleTables.length === 0) {
    parsingErrors.push("Education listing is missing its main schedule table");
  } else if (scheduleTables.length > 1) {
    parsingErrors.push(
      `Education listing has ${scheduleTables.length} possible main schedule tables`,
    );
  }

  const schedule = scheduleTables.length === 1 ? scheduleTables[0] : null;
  const termsByQuarter = new Map<IncludedQuarter, ParsedEducationTerm & { columnIndex: number }>();
  if (schedule) {
    for (const { columnIndex, term } of schedule.parsedHeaders) {
      if (!term) continue;
      if (termsByQuarter.has(term.quarter)) {
        parsingErrors.push(`Education listing has duplicate ${term.quarter} columns`);
        continue;
      }
      termsByQuarter.set(term.quarter, { ...term, columnIndex });
    }
  }

  for (const quarter of INCLUDED_QUARTERS) {
    const term = termsByQuarter.get(quarter);
    if (!term) {
      parsingErrors.push(`Education listing is missing its required ${quarter} column`);
      continue;
    }
    const expectedYear = quarter === "Fall" ? startYear : startYear + 1;
    if (term.year !== expectedYear.toString(10)) {
      parsingErrors.push(
        `Education ${term.header} column does not belong to academic year ${academicYear}`,
      );
    }
  }

  if (schedule) {
    const rows = $(schedule.table).find("tr").toArray().slice(1);
    for (const [rowIndex, row] of rows.entries()) {
      const cells = $(row).children("th, td");
      const rowValues = cells.toArray().map((cell) => normalizeEducationText($(cell).text()));
      if (rowValues.every((value) => value.length === 0)) continue;
      sourceTableRows += 1;

      for (const quarter of INCLUDED_QUARTERS) {
        const term = termsByQuarter.get(quarter);
        if (!term) continue;
        if (cells.length <= term.columnIndex) {
          parsingErrors.push(`Education row ${rowIndex + 1} is missing its ${quarter} course cell`);
          continue;
        }

        const cell = cells.eq(term.columnIndex).clone();
        cell.find("br").replaceWith("\n");
        cell.find("p, div, li").each((_index, element) => {
          $(element).append("\n");
        });
        const value = cell.text();
        if (isEducationPlaceholder(value)) continue;

        const parsedCourseIds = extractEducationCourseIds(value);
        if (parsedCourseIds.length === 0) {
          parsingErrors.push(
            `Education row ${rowIndex + 1} ${quarter} cell contains unrecognized content '${normalizeEducationText(value)}'`,
          );
          continue;
        }

        courseEntriesByQuarter[quarter] += parsedCourseIds.length;
        normalizedCourseEntries += parsedCourseIds.length;
        for (const courseId of parsedCourseIds) {
          courseIds.add(courseId);
          const offering: ParsedEducationCourseOffering = {
            academicYear,
            courseId,
            year: term.year,
            quarter,
            instructors: [],
          };
          const key = offeringKey(offering);
          if (offerings.has(key)) duplicateTopicRowsCollapsed += 1;
          else offerings.set(key, offering);
        }
      }
    }
  }

  for (const quarter of INCLUDED_QUARTERS) {
    if (termsByQuarter.has(quarter) && courseEntriesByQuarter[quarter] === 0) {
      parsingErrors.push(`Education listing has no usable ${quarter} course entries`);
    }
  }

  const displayedSourceUpdateValue = parseEducationDisplayedLastUpdated(html);
  if (/Last Updated:/i.test($.root().text()) && !displayedSourceUpdateValue) {
    parsingErrors.push("Could not parse the Education page's month-level last updated value");
  }

  return {
    sourceTableRows,
    courseEntriesByQuarter,
    normalizedCourseEntries,
    duplicateTopicRowsCollapsed,
    displayedSourceUpdateValue,
    lastUpdated: null,
    courseIds: Array.from(courseIds).toSorted(),
    offerings: Array.from(offerings.values()),
    terms: INCLUDED_QUARTERS.flatMap((quarter) => {
      const term = termsByQuarter.get(quarter);
      if (!term) return [];
      const { columnIndex: _, ...parsedTerm } = term;
      return [parsedTerm];
    }),
    academicYear,
    parsingErrors,
  };
}

export function selectImportableEducationOfferings(
  parsed: ParsedEducationCourseOfferingsPage,
  calendarTerms: CalendarTermForImport[],
  now: Date,
): ImportableEducationOfferings {
  const calendarByTerm = new Map(calendarTerms.map((term) => [termKey(term), term]));
  const importableScopeKeys = new Set<string>();
  const scopes = new Map<string, ImportScope>();
  const skippedOrStaleTerms = new Set<string>();

  for (const term of parsed.terms) {
    const calendar = calendarByTerm.get(termKey(term));
    if (!calendar) {
      skippedOrStaleTerms.add(`${term.header} (missing calendar metadata)`);
      continue;
    }
    if (calendar.instructionStart.getTime() <= now.getTime()) {
      skippedOrStaleTerms.add(`${term.header} (term has begun)`);
      continue;
    }

    importableScopeKeys.add(scopeKey(term));
    scopes.set(scopeKey(term), {
      academicYear: term.academicYear,
      year: term.year,
      quarter: term.quarter,
    });
  }

  return {
    offerings: parsed.offerings.filter((offering) => importableScopeKeys.has(scopeKey(offering))),
    scopes: Array.from(scopes.values()),
    skippedOrStaleTerms: Array.from(skippedOrStaleTerms),
  };
}

async function fetchHtml(fetcher: typeof fetch): Promise<string> {
  const response = await fetcher(EDUCATION_COURSE_OFFERINGS_URL, {
    headers: {
      "User-Agent": "Anteater API tentative course offerings scraper",
    },
  });
  if (!response.ok) {
    throw new Error(`Failed to fetch ${EDUCATION_COURSE_OFFERINGS_URL}: HTTP ${response.status}`);
  }
  return await response.text();
}

export async function doScrape(
  db: ReturnType<typeof database>,
  fetcher: typeof fetch = fetch,
  now = new Date(),
): Promise<EducationScrapeSummary> {
  const html = await fetchHtml(fetcher);
  const parsed = parseEducationCourseOfferings(html);
  if (parsed.sourceTableRows === 0 || parsed.terms.length === 0) {
    throw new Error("Education listing did not contain a usable schedule table");
  }

  const sourceYears = Array.from(new Set(parsed.terms.map(({ year }) => year)));
  const [knownCourses, calendarTerms] = await Promise.all([
    db.select({ id: course.id }).from(course).where(inArray(course.id, parsed.courseIds)),
    db
      .select({
        year: calendarTerm.year,
        quarter: calendarTerm.quarter,
        instructionStart: calendarTerm.instructionStart,
      })
      .from(calendarTerm)
      .where(inArray(calendarTerm.year, sourceYears)),
  ]);
  const knownCourseIds = new Set(knownCourses.map(({ id }) => id));
  const matchedCourseIds = parsed.courseIds.filter((id) => knownCourseIds.has(id));
  const unmatchedCourseIds = parsed.courseIds.filter((id) => !knownCourseIds.has(id));
  const importable = selectImportableEducationOfferings(parsed, calendarTerms, now);
  const values: Array<typeof tentativeCourseOffering.$inferInsert> = importable.offerings
    .filter(({ courseId }) => knownCourseIds.has(courseId))
    .map((offering) => ({
      source: EDUCATION_COURSE_OFFERINGS_SOURCE,
      sourceUrl: EDUCATION_COURSE_OFFERINGS_URL,
      academicYear: offering.academicYear,
      courseId: offering.courseId,
      year: offering.year,
      quarter: offering.quarter,
      instructors: [],
      lastUpdated: null,
    }));

  if (importable.offerings.length > 0 && values.length === 0) {
    throw new Error(
      "Education listing did not contain future offerings for any known Anteater API courses",
    );
  }

  const scopeKeys = new Set(importable.scopes.map(scopeKey));
  const academicYears = Array.from(
    new Set(importable.scopes.map(({ academicYear }) => academicYear)),
  );
  const existingRows =
    academicYears.length > 0
      ? await db
          .select({
            academicYear: tentativeCourseOffering.academicYear,
            courseId: tentativeCourseOffering.courseId,
            year: tentativeCourseOffering.year,
            quarter: tentativeCourseOffering.quarter,
          })
          .from(tentativeCourseOffering)
          .where(
            and(
              eq(tentativeCourseOffering.source, EDUCATION_COURSE_OFFERINGS_SOURCE),
              inArray(tentativeCourseOffering.academicYear, academicYears),
            ),
          )
      : [];
  const relevantExistingRows = existingRows.filter((row) => scopeKeys.has(scopeKey(row)));
  const existingKeys = new Set(
    relevantExistingRows.map((row) =>
      offeringKey({ ...row, instructors: [] } as ParsedEducationCourseOffering),
    ),
  );
  const currentKeys = new Set(
    values.map((value) =>
      offeringKey({
        academicYear: value.academicYear,
        courseId: value.courseId,
        year: value.year,
        quarter: value.quarter as IncludedQuarter,
        instructors: [],
      }),
    ),
  );
  const rowsInserted = Array.from(currentKeys).filter((key) => !existingKeys.has(key)).length;
  const rowsUpdated = Array.from(currentKeys).filter((key) => existingKeys.has(key)).length;
  const sourceCurrentKeys = new Set(importable.offerings.map(offeringKey));
  const cleanupEnabled = parsed.parsingErrors.length === 0;
  const rowsDeactivated = cleanupEnabled
    ? Array.from(existingKeys).filter((key) => !sourceCurrentKeys.has(key)).length
    : 0;

  if (importable.scopes.length > 0) {
    await db.transaction(async (tx) => {
      for (const scope of importable.scopes) {
        const sourceCourseIds = Array.from(
          new Set(
            importable.offerings
              .filter((offering) => scopeKey(offering) === scopeKey(scope))
              .map(({ courseId }) => courseId),
          ),
        );
        const scopeConditions = and(
          eq(tentativeCourseOffering.source, EDUCATION_COURSE_OFFERINGS_SOURCE),
          eq(tentativeCourseOffering.academicYear, scope.academicYear),
          eq(tentativeCourseOffering.year, scope.year),
          eq(tentativeCourseOffering.quarter, scope.quarter),
        );

        if (cleanupEnabled) {
          await tx
            .delete(tentativeCourseOffering)
            .where(
              sourceCourseIds.length > 0
                ? and(
                    scopeConditions,
                    notInArray(tentativeCourseOffering.courseId, sourceCourseIds),
                  )
                : scopeConditions,
            );
        }
      }

      if (values.length > 0) {
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
      }
    });
  }

  const summary: EducationScrapeSummary = {
    sourceTableRows: parsed.sourceTableRows,
    courseEntriesByQuarter: parsed.courseEntriesByQuarter,
    normalizedCourseEntries: parsed.normalizedCourseEntries,
    uniqueOfferings: parsed.offerings.length,
    uniqueCourseIds: parsed.courseIds.length,
    duplicateTopicRowsCollapsed: parsed.duplicateTopicRowsCollapsed,
    displayedSourceUpdateValue: parsed.displayedSourceUpdateValue,
    matchedCourseIds,
    unmatchedCourseIds,
    rowsInserted,
    rowsUpdated,
    rowsDeactivated,
    skippedOrStaleTerms: importable.skippedOrStaleTerms,
    parsingErrors: parsed.parsingErrors,
  };
  console.log(JSON.stringify(summary));
  return summary;
}

function parseCsvRows(csv: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let index = 0; index < csv.length; index += 1) {
    const character = csv[index];
    if (quoted) {
      if (character === '"' && csv[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else if (character === '"') quoted = false;
      else cell += character;
    } else if (character === '"') quoted = true;
    else if (character === ",") {
      row.push(cell);
      cell = "";
    } else if (character === "\n" || character === "\r") {
      if (character === "\r" && csv[index + 1] === "\n") index += 1;
      row.push(cell);
      if (row.some((value) => value.length > 0)) rows.push(row);
      row = [];
      cell = "";
    } else cell += character;
  }
  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

function parseEducationPhdUpdate(rows: string[][]): Date | null {
  const revision = rows
    .flat()
    .join(" ")
    .match(/\bREV:\s*(\d{1,2})\/(\d{1,2})\/(20\d{2})\b/i);
  if (!revision) return null;
  const month = Number.parseInt(revision[1], 10);
  const day = Number.parseInt(revision[2], 10);
  const year = Number.parseInt(revision[3], 10);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() === month - 1 &&
    parsed.getUTCDate() === day
    ? parsed
    : null;
}

function parseEducationPhdInstructor(value: string, courseMatch: RegExpMatchArray): string[] {
  const remainder = normalizeEducationText(
    value.slice((courseMatch.index ?? 0) + courseMatch[0].length),
  ).replace(/^\s*[:\-.]?\s*/, "");
  if (!remainder) return [];
  const words = remainder.split(/\s+/).filter(Boolean);
  const candidate = words.at(-1) ?? "";
  if (
    !/^[A-Z][A-Za-z.'-]+$/.test(candidate) ||
    /^(?:Research|Methods|Analysis|Practicum|Education|Learning|Development|Culture|Foundations|Statistics|Seminar)$/i.test(
      candidate,
    )
  )
    return [];
  if (words.length > 1 && /^(?:de|van|von|del|da|di)$/i.test(words.at(-2) ?? ""))
    return [`${words.at(-2)} ${candidate}`];
  return [candidate];
}

export function parseEducationPhdCourseOfferings(
  csv: string,
): ParsedEducationPhdCourseOfferingsPage {
  const rows = parseCsvRows(csv).map((row) => row.map(normalizeEducationText));
  const title = rows[0]?.join(" ") ?? "";
  const yearMatch = title.match(
    /Tentative\s+(20\d{2})\s*[-–—]\s*(20\d{2}|\d{2})\s+PhD Course Schedule/i,
  );
  if (!yearMatch) throw new Error("Education Ph.D. sheet did not contain a valid academic year");
  const startYear = Number.parseInt(yearMatch[1], 10);
  const endYear =
    yearMatch[2].length === 2
      ? Math.floor(startYear / 100) * 100 + Number.parseInt(yearMatch[2], 10)
      : Number.parseInt(yearMatch[2], 10);
  if (endYear !== startYear + 1)
    throw new Error(
      `Education Ph.D. sheet has nonconsecutive academic year ${yearMatch[1]}-${yearMatch[2]}`,
    );
  const academicYear = academicYearLabel(startYear);
  const header = rows.findIndex((row) => row.some((value) => /^Fall 20\d{2}$/.test(value)));
  if (header < 0) throw new Error("Education Ph.D. sheet is missing its term header row");
  const terms: Array<ParsedEducationTerm & { columnIndex: number }> = [];
  for (const [columnIndex, value] of rows[header].entries()) {
    const term = parseEducationTermHeader(value, academicYear);
    if (term) terms.push({ ...term, columnIndex });
  }
  const parsingErrors: string[] = [];
  for (const quarter of INCLUDED_QUARTERS) {
    const term = terms.find((value) => value.quarter === quarter);
    const expectedYear = quarter === "Fall" ? startYear : startYear + 1;
    if (!term)
      parsingErrors.push(`Education Ph.D. sheet is missing its required ${quarter} column`);
    else if (term.year !== String(expectedYear))
      parsingErrors.push(
        `Education Ph.D. ${term.header} does not belong to academic year ${academicYear}`,
      );
  }
  const offerings = new Map<string, ParsedEducationPhdCourseOffering>();
  const courseIds = new Set<string>();
  let sourceRowsParsed = 0;
  let normalizedCourseRows = 0;
  let instructorNamesParsed = 0;
  let duplicateRowsCollapsed = 0;
  for (const row of rows.slice(header + 1)) {
    if (row.every((value) => value.length === 0)) continue;
    sourceRowsParsed += 1;
    for (const term of terms) {
      const value = row[term.columnIndex] ?? "";
      if (!value) continue;
      const matches = Array.from(value.matchAll(/\b(?:EDUC|ED)\s*[A-Z]*\d+[A-Z]*\b/giu));
      if (matches.length === 0) {
        if (
          !/^\s*(?:REV|School Required|Professional Development|Methodology|Content Courses)/i.test(
            value,
          )
        )
          parsingErrors.push(
            `Education Ph.D. ${term.header} contains unrecognized content '${value}'`,
          );
        continue;
      }
      for (const match of matches) {
        const courseId = normalizeEducationCourseId(match[0]);
        if (!courseId) {
          parsingErrors.push(
            `Education Ph.D. ${term.header} has malformed course identifier '${match[0]}'`,
          );
          continue;
        }
        normalizedCourseRows += 1;
        courseIds.add(courseId);
        const instructors = parseEducationPhdInstructor(value, match);
        instructorNamesParsed += instructors.length;
        const offering: ParsedEducationPhdCourseOffering = {
          academicYear,
          courseId,
          year: term.year,
          quarter: term.quarter,
          instructors,
        };
        const key = phdOfferingKey(offering);
        const existing = offerings.get(key);
        if (existing) {
          existing.instructors = Array.from(new Set([...existing.instructors, ...instructors]));
          duplicateRowsCollapsed += 1;
        } else offerings.set(key, offering);
      }
    }
  }
  if (terms.length === 3 && offerings.size === 0)
    parsingErrors.push("Education Ph.D. sheet contains no usable offerings");
  for (const term of terms) {
    if (
      !Array.from(offerings.values()).some(
        (offering) => offering.year === term.year && offering.quarter === term.quarter,
      )
    )
      parsingErrors.push(`Education Ph.D. sheet has no usable ${term.quarter} offerings`);
  }
  return {
    sourceRowsParsed,
    normalizedCourseRows,
    instructorNamesParsed,
    duplicateRowsCollapsed,
    courseIds: Array.from(courseIds).toSorted(),
    offerings: Array.from(offerings.values()),
    terms: terms.map(({ columnIndex: _, ...term }) => term),
    academicYear,
    lastUpdated: parseEducationPhdUpdate(rows),
    parsingErrors,
  };
}

async function fetchEducationPhdCsv(fetcher: typeof fetch): Promise<string> {
  const response = await fetcher(EDUCATION_PHD_SHEET_CSV_URL, {
    headers: { "User-Agent": "Anteater API Education Ph.D. scraper" },
  });
  if (!response.ok)
    throw new Error(`Failed to fetch ${EDUCATION_PHD_SHEET_CSV_URL}: HTTP ${response.status}`);
  return response.text();
}

export async function doPhdScrape(
  db: ReturnType<typeof database>,
  fetcher: typeof fetch = fetch,
  now = new Date(),
): Promise<EducationPhdScrapeSummary> {
  const parsed = parseEducationPhdCourseOfferings(await fetchEducationPhdCsv(fetcher));
  const [knownCourses, knownInstructors, calendarTerms] = await Promise.all([
    db.select({ id: course.id }).from(course).where(inArray(course.id, parsed.courseIds)),
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
  const knownIds = new Set(knownCourses.map(({ id }) => id));
  const matchedCourseIds = parsed.courseIds.filter((id) => knownIds.has(id));
  const unmatchedCourseIds = parsed.courseIds.filter((id) => !knownIds.has(id));
  const calendarByTerm = new Map(calendarTerms.map((term) => [termKey(term), term]));
  const scopes = parsed.terms.filter((term) => {
    const calendar = calendarByTerm.get(termKey(term));
    return calendar && calendar.instructionStart.getTime() > now.getTime();
  });
  const skippedOrStaleTerms = parsed.terms
    .filter((term) => !scopes.includes(term))
    .map((term) => `${term.header} (term has begun or missing calendar metadata)`);
  const offerings = parsed.offerings.filter((offering) =>
    scopes.some(
      (scope) => scopeKey(scope) === phdOfferingKey(offering).split("|").slice(0, 2).join("|"),
    ),
  );
  const values = offerings
    .filter(({ courseId }) => knownIds.has(courseId))
    .map((offering) => ({
      source: EDUCATION_PHD_COURSE_OFFERINGS_SOURCE,
      sourceUrl: EDUCATION_PHD_COURSE_OFFERINGS_URL,
      academicYear: offering.academicYear,
      courseId: offering.courseId,
      year: offering.year,
      quarter: offering.quarter,
      instructors: resolveEducationPhdInstructors(offering.instructors, knownInstructors),
      lastUpdated: offering.academicYear === parsed.academicYear ? parsed.lastUpdated : null,
    }));
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
        eq(tentativeCourseOffering.source, EDUCATION_PHD_COURSE_OFFERINGS_SOURCE),
        eq(tentativeCourseOffering.academicYear, parsed.academicYear),
      ),
    );
  const scopeKeys = new Set(
    scopes.map((scope) => `${scope.academicYear}|${scope.year} ${scope.quarter}`),
  );
  const relevantExisting = existing.filter((row) =>
    scopeKeys.has(`${row.academicYear}|${row.year} ${row.quarter}`),
  );
  const existingKeys = new Set(
    relevantExisting.map((row) => `${row.academicYear}|${row.year} ${row.quarter}|${row.courseId}`),
  );
  const currentKeys = new Set(
    values.map((value) => `${value.academicYear}|${value.year} ${value.quarter}|${value.courseId}`),
  );
  const rowsInserted = Array.from(currentKeys).filter((key) => !existingKeys.has(key)).length;
  const rowsUpdated = Array.from(currentKeys).filter((key) => existingKeys.has(key)).length;
  const rowsDeactivated =
    parsed.parsingErrors.length === 0
      ? Array.from(existingKeys).filter((key) => !currentKeys.has(key)).length
      : 0;
  if (scopes.length > 0)
    await db.transaction(async (tx) => {
      if (parsed.parsingErrors.length === 0)
        for (const scope of scopes) {
          const keep = Array.from(
            new Set([
              ...unmatchedCourseIds,
              ...offerings
                .filter(
                  (offering) => offering.year === scope.year && offering.quarter === scope.quarter,
                )
                .map(({ courseId }) => courseId),
            ]),
          );
          const condition = and(
            eq(tentativeCourseOffering.source, EDUCATION_PHD_COURSE_OFFERINGS_SOURCE),
            eq(tentativeCourseOffering.academicYear, parsed.academicYear),
            eq(tentativeCourseOffering.year, scope.year),
            eq(tentativeCourseOffering.quarter, scope.quarter),
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
  const unresolvedInstructorNames = Array.from(
    new Set(parsed.offerings.flatMap(({ instructors }) => instructors)),
  ).filter((name) => resolveEducationPhdInstructors([name], knownInstructors).length === 0);
  const summary = {
    ...parsed,
    uniqueOfferings: parsed.offerings.length,
    matchedCourseIds,
    unmatchedCourseIds,
    unresolvedInstructorNames,
    rowsInserted,
    rowsUpdated,
    rowsDeactivated,
    skippedOrStaleTerms,
  };
  console.log(JSON.stringify(summary));
  return summary;
}

export async function doAllEducationScrapes(db: ReturnType<typeof database>): Promise<void> {
  const errors: unknown[] = [];
  try {
    await doScrape(db);
  } catch (error) {
    console.warn(`Skipping Education undergraduate source: ${(error as Error).message}`);
    errors.push(error);
  }
  try {
    await doPhdScrape(db);
  } catch (error) {
    console.warn(`Skipping Education Ph.D. source: ${(error as Error).message}`);
    errors.push(error);
  }
  if (errors.length > 0)
    throw new AggregateError(errors, "One or more Education course-offerings sources failed");
}

function resolveEducationPhdInstructors(
  names: string[],
  known: Array<{ ucinetid: string; name: string; department: string }>,
): TentativeInstructor[] {
  return Array.from(new Set(names)).flatMap((name) => {
    const normalized = normalizeEducationText(name).toLowerCase();
    const candidates = known.filter(
      (record) =>
        normalizeEducationText(record.name).toLowerCase() === normalized ||
        normalizeEducationText(record.name).toLowerCase().endsWith(` ${normalized}`),
    );
    return candidates.length === 1
      ? [{ status: "assigned", name, ucinetid: candidates[0].ucinetid }]
      : [];
  });
}
