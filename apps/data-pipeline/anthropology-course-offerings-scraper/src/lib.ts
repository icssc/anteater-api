import type { database } from "@packages/db";
import { and, eq, inArray, notInArray } from "@packages/db/drizzle";
import type { Term } from "@packages/db/schema";
import { calendarTerm, course, tentativeCourseOffering } from "@packages/db/schema";
import { conflictUpdateSetAllCols } from "@packages/db/utils";
import { type Cheerio, load } from "cheerio";
import type { Element } from "domhandler";

export const ANTHROPOLOGY_COURSE_OFFERINGS_SOURCE = "ANTHROPOLOGY_COURSE_OFFERINGS";
export const ANTHROPOLOGY_COURSE_OFFERINGS_URL =
  "https://www.anthropology.uci.edu/undergrad/courses.php";

const INCLUDED_QUARTERS = ["Fall", "Winter", "Spring"] as const;
type IncludedQuarter = (typeof INCLUDED_QUARTERS)[number];

const CHECKMARKS = new Set(["✓", "✔", "☑", "✅"]);
const MONTHS = [
  "january",
  "february",
  "march",
  "april",
  "may",
  "june",
  "july",
  "august",
  "september",
  "october",
  "november",
  "december",
] as const;

export type ParsedAnthropologyTerm = {
  header: string;
  academicYear: string;
  year: string;
  quarter: IncludedQuarter;
};

export type ParsedAnthropologyCourseOffering = Omit<ParsedAnthropologyTerm, "header"> & {
  courseId: string;
  instructors: [];
};

export type ParsedAnthropologyCourseOfferingsPage = {
  sourceTableRows: number;
  normalizedRows: number;
  rawCheckmarkCellsByQuarter: Record<IncludedQuarter, number>;
  offeringsByQuarter: Record<IncludedQuarter, number>;
  duplicateRowsCollapsedByQuarter: Record<IncludedQuarter, number>;
  duplicateTopicRowsCollapsed: number;
  duplicate180AwRowsCollapsed: number;
  scheduleTablesDiscovered: number;
  courseIds: string[];
  offerings: ParsedAnthropologyCourseOffering[];
  terms: ParsedAnthropologyTerm[];
  academicYear: string | null;
  lastUpdated: Date | null;
  parsingErrors: string[];
};

export type AnthropologyScrapeSummary = {
  sourceTableRows: number;
  normalizedRows: number;
  rawCheckmarkCellsByQuarter: Record<IncludedQuarter, number>;
  offeringsByQuarter: Record<IncludedQuarter, number>;
  uniqueOfferings: number;
  uniqueCourseIds: number;
  duplicateRowsCollapsedByQuarter: Record<IncludedQuarter, number>;
  duplicateTopicRowsCollapsed: number;
  duplicate180AwRowsCollapsed: number;
  matchedCourseIds: string[];
  unmatchedCourseIds: string[];
  rowsInserted: number;
  rowsUpdated: number;
  rowsDeactivated: number;
  displayedSourceUpdateDate: Date | null;
  skippedOrStaleTerms: string[];
  parsingErrors: string[];
};

type CalendarTermForImport = {
  year: string;
  quarter: Term;
  instructionStart: Date;
};

type ImportScope = Omit<ParsedAnthropologyTerm, "header">;

type ImportableAnthropologyOfferings = {
  offerings: ParsedAnthropologyCourseOffering[];
  scopes: ImportScope[];
  skippedOrStaleTerms: string[];
};

type TableColumns = {
  course: number;
  title: number;
  terms: Array<ParsedAnthropologyTerm & { columnIndex: number }>;
};

const normalizeWhitespace = (value: string) =>
  value
    .normalize("NFKC")
    .replaceAll(/[\u200B-\u200D\u2060\uFEFF]/g, "")
    .replaceAll(/[\s\p{Z}]+/gu, " ")
    .trim();

const academicYearLabel = (startYear: number) => `${startYear}-${startYear + 1}`;

const termKey = (term: { year: string; quarter: string }) => `${term.year} ${term.quarter}`;

const scopeKey = (term: { academicYear: string; year: string; quarter: string }) =>
  `${term.academicYear}|${termKey(term)}`;

const offeringKey = (offering: ParsedAnthropologyCourseOffering) =>
  `${scopeKey(offering)}|${offering.courseId}`;

function emptyQuarterCounts(): Record<IncludedQuarter, number> {
  return { Fall: 0, Winter: 0, Spring: 0 };
}

export function normalizeAnthropologyText(value: string): string {
  return normalizeWhitespace(value);
}

export function normalizeAnthropologyCourseId(sourceCourseId: string): string | null {
  const normalized = normalizeAnthropologyText(sourceCourseId.toUpperCase());
  const match = normalized.match(/^(H?\d+[A-Z]*)(?:\s*\((Special Topics|Topics Vary)\))?$/i);
  if (!match) return null;

  const numberMatch = match[1].match(/^(H?)(\d+)([A-Z]*)$/);
  if (!numberMatch) return null;
  const numeric = Number.parseInt(numberMatch[2], 10);
  if (!Number.isInteger(numeric)) return null;
  return `ANTHRO${numberMatch[1]}${numeric}${numberMatch[3]}`;
}

export function parseAnthropologyAcademicYear(html: string): {
  academicYear: string;
  startYear: number;
} | null {
  const $ = load(html);
  const headings = $("h1, h2, h3, h4, h5, h6")
    .toArray()
    .map((heading) => normalizeAnthropologyText($(heading).text()));
  const heading = headings.find((value) =>
    /^Tentative Course Offerings Schedule\s+20\d{2}/i.test(value),
  );
  const match = heading?.match(
    /^Tentative Course Offerings Schedule\s+(20\d{2})\s*[-–—](20\d{2}|\d{2})$/i,
  );
  if (!match) return null;

  const startYear = Number.parseInt(match[1], 10);
  const endYearValue = Number.parseInt(match[2], 10);
  const endYear =
    match[2].length === 2 ? Math.floor(startYear / 100) * 100 + endYearValue : endYearValue;
  if (endYear !== startYear + 1) return null;
  return { academicYear: academicYearLabel(startYear), startYear };
}

export function parseAnthropologyLastUpdated(html: string): Date | null {
  const $ = load(html);
  const text = normalizeAnthropologyText($.root().text());
  const match = text.match(/\bLast updated:\s+([A-Za-z]+)\s+(\d{1,2}),\s+(20\d{2})\b/i);
  if (!match) return null;

  const month = MONTHS.indexOf(match[1].toLocaleLowerCase() as (typeof MONTHS)[number]);
  const day = Number.parseInt(match[2], 10);
  const year = Number.parseInt(match[3], 10);
  if (month === -1 || day < 1 || day > 31) return null;

  const parsed = new Date(Date.UTC(year, month, day));
  return parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() === month &&
    parsed.getUTCDate() === day
    ? parsed
    : null;
}

export function parseAnthropologyTermHeader(
  value: string,
  academicYear: string,
  startYear: number,
): ParsedAnthropologyTerm | null {
  const header = normalizeAnthropologyText(value);
  const match = header.match(/^(Fall|Winter|Spring)$/i);
  if (!match) return null;
  const quarter = `${match[1][0].toUpperCase()}${match[1]
    .slice(1)
    .toLocaleLowerCase()}` as IncludedQuarter;
  const year = quarter === "Fall" ? startYear : startYear + 1;
  return { header, academicYear, year: year.toString(10), quarter };
}

function tableHeaders($: ReturnType<typeof load>, table: Cheerio<Element>): string[] {
  return $(table)
    .find("thead tr")
    .first()
    .children("th, td")
    .toArray()
    .map((cell) => normalizeAnthropologyText($(cell).text()));
}

function parseTableColumns(
  $: ReturnType<typeof load>,
  table: Cheerio<Element>,
  academic: { academicYear: string; startYear: number } | null,
  parsingErrors: string[],
): TableColumns {
  const headers = tableHeaders($, table);
  const normalizedHeaders = headers.map((header) => header.toLocaleLowerCase());
  const course = normalizedHeaders.indexOf("course number");
  const title = normalizedHeaders.indexOf("course name");
  const terms: Array<ParsedAnthropologyTerm & { columnIndex: number }> = [];

  if (course < 0 || title < 0) {
    parsingErrors.push("Anthropology listing is missing its Course Number or Course Name header");
  }
  if (!academic) return { course, title, terms };

  for (const [columnIndex, header] of headers.entries()) {
    const term = parseAnthropologyTermHeader(header, academic.academicYear, academic.startYear);
    if (term) terms.push({ ...term, columnIndex });
  }
  for (const quarter of INCLUDED_QUARTERS) {
    if (!terms.some((term) => term.quarter === quarter)) {
      parsingErrors.push(`Anthropology listing is missing its required ${quarter} column`);
    }
  }
  return { course, title, terms };
}

export function parseAnthropologyCourseOfferings(
  html: string,
): ParsedAnthropologyCourseOfferingsPage {
  const $ = load(html);
  const academic = parseAnthropologyAcademicYear(html);
  const parsingErrors: string[] = [];
  if (!academic) {
    parsingErrors.push("Anthropology listing is missing a valid academic-year schedule heading");
  }

  const heading = $("h1, h2, h3, h4, h5, h6")
    .toArray()
    .find((element) =>
      /^Tentative Course Offerings Schedule\s+20\d{2}/i.test(
        normalizeAnthropologyText($(element).text()),
      ),
    );
  const scheduleRoot = heading ? $(heading).parent().first() : null;
  const tableCandidates = scheduleRoot
    ? $(scheduleRoot)
        .find("table")
        .toArray()
        .map((table) => ({ table: $(table), headers: tableHeaders($, $(table)) }))
        .filter(({ headers }) => {
          const normalized = headers.map((header) => header.toLocaleLowerCase());
          return normalized.includes("course number") && normalized.includes("course name");
        })
    : [];

  if (tableCandidates.length === 0) {
    parsingErrors.push("Anthropology listing is missing its undergraduate schedule table");
  } else if (tableCandidates.length > 1) {
    parsingErrors.push(`Anthropology listing has ${tableCandidates.length} schedule tables`);
  }
  const scheduleTable = tableCandidates.length === 1 ? tableCandidates[0].table : null;
  const columns = scheduleTable
    ? parseTableColumns($, scheduleTable, academic, parsingErrors)
    : { course: -1, title: -1, terms: [] };
  const termsByQuarter = new Map<
    IncludedQuarter,
    ParsedAnthropologyTerm & { columnIndex: number }
  >();
  for (const term of columns.terms) {
    if (termsByQuarter.has(term.quarter)) {
      parsingErrors.push(`Anthropology listing has duplicate ${term.quarter} columns`);
      continue;
    }
    termsByQuarter.set(term.quarter, term);
  }

  const rawCheckmarkCellsByQuarter = emptyQuarterCounts();
  const offeringsByQuarter = emptyQuarterCounts();
  const duplicateRowsCollapsedByQuarter = emptyQuarterCounts();
  const offerings = new Map<string, ParsedAnthropologyCourseOffering>();
  const courseIds = new Set<string>();
  let sourceRows = 0;
  let normalizedRows = 0;
  let duplicateTopicRowsCollapsed = 0;
  let duplicate180AwRowsCollapsed = 0;

  if (scheduleTable && academic) {
    const rows = $(scheduleTable).find("tbody tr").toArray();
    for (const [rowIndex, row] of rows.entries()) {
      const cells = $(row).children("th, td");
      const values = cells.toArray().map((cell) => normalizeAnthropologyText($(cell).text()));
      if (values.every((value) => value.length === 0)) continue;

      if (
        values.length >= 2 &&
        values[columns.course]?.toLocaleLowerCase() === "course number" &&
        values[columns.title]?.toLocaleLowerCase() === "course name"
      ) {
        continue;
      }
      sourceRows += 1;

      const maxRequiredIndex = Math.max(
        columns.course,
        columns.title,
        ...columns.terms.map(({ columnIndex }) => columnIndex),
      );
      if (columns.course < 0 || columns.title < 0 || cells.length <= maxRequiredIndex) {
        parsingErrors.push(`Anthropology row ${rowIndex + 1} is missing required cells`);
        continue;
      }

      const courseId = normalizeAnthropologyCourseId(values[columns.course]);
      if (!courseId) {
        parsingErrors.push(
          `Anthropology row ${rowIndex + 1} has malformed course identifier '${values[columns.course]}'`,
        );
        continue;
      }
      normalizedRows += 1;
      courseIds.add(courseId);

      for (const term of columns.terms) {
        const marker = values[term.columnIndex] ?? "";
        if (marker.length === 0) continue;
        rawCheckmarkCellsByQuarter[term.quarter] += 1;
        if (!CHECKMARKS.has(marker)) {
          parsingErrors.push(
            `Anthropology row ${rowIndex + 1} ${term.quarter} cell has unexpected marker '${marker}'`,
          );
          continue;
        }

        const offering: ParsedAnthropologyCourseOffering = {
          academicYear: term.academicYear,
          courseId,
          year: term.year,
          quarter: term.quarter,
          instructors: [],
        };
        const key = offeringKey(offering);
        if (offerings.has(key)) {
          duplicateRowsCollapsedByQuarter[term.quarter] += 1;
          duplicateTopicRowsCollapsed += 1;
          if (courseId === "ANTHRO180AW") duplicate180AwRowsCollapsed += 1;
        } else {
          offerings.set(key, offering);
          offeringsByQuarter[term.quarter] += 1;
        }
      }
    }
  }

  for (const quarter of INCLUDED_QUARTERS) {
    if (!termsByQuarter.has(quarter)) {
      parsingErrors.push(`Anthropology listing is missing its required ${quarter} column`);
    }
    if (offeringsByQuarter[quarter] === 0) {
      parsingErrors.push(`Anthropology listing has no usable ${quarter} offerings`);
    }
  }

  const scheduleText = scheduleRoot ? $(scheduleRoot).text() : "";
  const lastUpdated = parseAnthropologyLastUpdated(scheduleText);
  if (/Last updated:/i.test(scheduleText) && !lastUpdated) {
    parsingErrors.push("Could not parse Anthropology listing's Last updated value");
  }

  return {
    sourceTableRows: sourceRows,
    normalizedRows,
    rawCheckmarkCellsByQuarter,
    offeringsByQuarter,
    duplicateRowsCollapsedByQuarter,
    duplicateTopicRowsCollapsed,
    duplicate180AwRowsCollapsed,
    scheduleTablesDiscovered: tableCandidates.length,
    courseIds: Array.from(courseIds).toSorted(),
    offerings: Array.from(offerings.values()),
    terms: INCLUDED_QUARTERS.flatMap((quarter) => {
      const term = termsByQuarter.get(quarter);
      if (!term) return [];
      const { columnIndex: _, ...parsedTerm } = term;
      return [parsedTerm];
    }),
    academicYear: academic?.academicYear ?? null,
    lastUpdated,
    parsingErrors,
  };
}

export function selectImportableAnthropologyOfferings(
  parsed: ParsedAnthropologyCourseOfferingsPage,
  calendarTerms: CalendarTermForImport[],
  now: Date,
): ImportableAnthropologyOfferings {
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
  const response = await fetcher(ANTHROPOLOGY_COURSE_OFFERINGS_URL, {
    headers: {
      "User-Agent": "Anteater API tentative course offerings scraper",
    },
  });
  if (!response.ok) {
    throw new Error(
      `Failed to fetch ${ANTHROPOLOGY_COURSE_OFFERINGS_URL}: HTTP ${response.status}`,
    );
  }
  return await response.text();
}

export async function doScrape(
  db: ReturnType<typeof database>,
  fetcher: typeof fetch = fetch,
  now = new Date(),
): Promise<AnthropologyScrapeSummary> {
  const html = await fetchHtml(fetcher);
  const parsed = parseAnthropologyCourseOfferings(html);
  if (
    parsed.academicYear === null ||
    parsed.scheduleTablesDiscovered !== 1 ||
    parsed.terms.length === 0
  ) {
    throw new Error("Anthropology listing did not contain a usable undergraduate schedule");
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
  const importable = selectImportableAnthropologyOfferings(parsed, calendarTerms, now);
  const values: Array<typeof tentativeCourseOffering.$inferInsert> = importable.offerings
    .filter(({ courseId }) => knownCourseIds.has(courseId))
    .map((offering) => ({
      source: ANTHROPOLOGY_COURSE_OFFERINGS_SOURCE,
      sourceUrl: ANTHROPOLOGY_COURSE_OFFERINGS_URL,
      academicYear: offering.academicYear,
      courseId: offering.courseId,
      year: offering.year,
      quarter: offering.quarter,
      instructors: [],
      lastUpdated: parsed.lastUpdated,
    }));

  if (importable.offerings.length > 0 && values.length === 0) {
    throw new Error(
      "Anthropology listing did not contain future offerings for any known Anteater API courses",
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
              eq(tentativeCourseOffering.source, ANTHROPOLOGY_COURSE_OFFERINGS_SOURCE),
              inArray(tentativeCourseOffering.academicYear, academicYears),
            ),
          )
      : [];
  const relevantExistingRows = existingRows.filter((row) => scopeKeys.has(scopeKey(row)));
  const existingKeys = new Set(
    relevantExistingRows.map((row) =>
      offeringKey({ ...row, instructors: [] } as ParsedAnthropologyCourseOffering),
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
          new Set([
            ...unmatchedCourseIds,
            ...importable.offerings
              .filter((offering) => scopeKey(offering) === scopeKey(scope))
              .map(({ courseId }) => courseId),
          ]),
        );
        const scopeConditions = and(
          eq(tentativeCourseOffering.source, ANTHROPOLOGY_COURSE_OFFERINGS_SOURCE),
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

  const summary: AnthropologyScrapeSummary = {
    sourceTableRows: parsed.sourceTableRows,
    normalizedRows: parsed.normalizedRows,
    rawCheckmarkCellsByQuarter: parsed.rawCheckmarkCellsByQuarter,
    offeringsByQuarter: parsed.offeringsByQuarter,
    uniqueOfferings: parsed.offerings.length,
    uniqueCourseIds: parsed.courseIds.length,
    duplicateRowsCollapsedByQuarter: parsed.duplicateRowsCollapsedByQuarter,
    duplicateTopicRowsCollapsed: parsed.duplicateTopicRowsCollapsed,
    duplicate180AwRowsCollapsed: parsed.duplicate180AwRowsCollapsed,
    matchedCourseIds,
    unmatchedCourseIds,
    rowsInserted,
    rowsUpdated,
    rowsDeactivated,
    displayedSourceUpdateDate: parsed.lastUpdated,
    skippedOrStaleTerms: importable.skippedOrStaleTerms,
    parsingErrors: parsed.parsingErrors,
  };
  console.log(JSON.stringify(summary));
  return summary;
}
