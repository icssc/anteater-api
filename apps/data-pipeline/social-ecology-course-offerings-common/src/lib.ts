import type { database } from "@packages/db";
import { and, eq, inArray, notInArray } from "@packages/db/drizzle";
import type { Term } from "@packages/db/schema";
import { calendarTerm, course, tentativeCourseOffering } from "@packages/db/schema";
import { conflictUpdateSetAllCols } from "@packages/db/utils";
import { load } from "cheerio";
import type { Element } from "domhandler";

export const INCLUDED_QUARTERS = ["Fall", "Winter", "Spring"] as const;
export type IncludedQuarter = (typeof INCLUDED_QUARTERS)[number];

export type SocialEcologySourceConfig = {
  source: string;
  sourceUrl: string;
  canonicalDepartment: string;
  sourceDepartmentPattern: string;
  courseNumberPattern: string;
  pageHeadingPattern: RegExp;
};

export type SocialEcologyTerm = {
  header: string;
  academicYear: string;
  year: string;
  quarter: IncludedQuarter;
};

export type SocialEcologyOffering = Omit<SocialEcologyTerm, "header"> & {
  courseId: string;
  instructors: [];
};

export type SocialEcologyParsedPage = {
  sourceEntriesByQuarter: Record<IncludedQuarter, number>;
  normalizedEntries: number;
  offeringsByQuarter: Record<IncludedQuarter, number>;
  uniqueOfferings: number;
  uniqueCourseIds: number;
  duplicateEntriesCollapsed: number;
  courseIds: string[];
  offerings: SocialEcologyOffering[];
  terms: SocialEcologyTerm[];
  academicYear: string | null;
  lastUpdated: null;
  displayedUpdate: string | null;
  scheduleTablesDiscovered: number;
  parsingErrors: string[];
};

export type SocialEcologyScrapeSummary = {
  sourceEntriesByQuarter: Record<IncludedQuarter, number>;
  normalizedEntries: number;
  offeringsByQuarter: Record<IncludedQuarter, number>;
  uniqueOfferings: number;
  uniqueCourseIds: number;
  duplicateEntriesCollapsed: number;
  matchedCourseIds: string[];
  unmatchedCourseIds: string[];
  rowsInserted: number;
  rowsUpdated: number;
  rowsDeactivated: number;
  displayedUpdate: string | null;
  lastUpdated: null;
  skippedOrStaleTerms: string[];
  parsingErrors: string[];
};

type CalendarTermForImport = {
  year: string;
  quarter: Term;
  instructionStart: Date;
};

type ImportScope = Omit<SocialEcologyTerm, "header">;

const MONTH_UPDATE_PATTERN =
  /\bLast updated:\s*(January|February|March|April|May|June|July|August|September|October|November|December)\s+(20\d{2})\b/i;

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
const offeringKey = (offering: {
  academicYear: string;
  year: string;
  quarter: string;
  courseId: string;
}) => `${scopeKey(offering)}|${offering.courseId}`;

const emptyQuarterCounts = (): Record<IncludedQuarter, number> => ({
  Fall: 0,
  Winter: 0,
  Spring: 0,
});

export function normalizeSocialEcologyCourseId(
  sourceCourseId: string,
  config: Pick<
    SocialEcologySourceConfig,
    "canonicalDepartment" | "sourceDepartmentPattern" | "courseNumberPattern"
  >,
): string | null {
  const value = normalizeWhitespace(sourceCourseId);
  const expression = new RegExp(
    `^${config.sourceDepartmentPattern}\\s+(${config.courseNumberPattern})$`,
    "i",
  );
  const match = value.match(expression);
  if (!match) return null;
  return `${config.canonicalDepartment}${match[1].toUpperCase()}`;
}

export function parseSocialEcologyAcademicYear(
  html: string,
  headingPattern: RegExp,
): { academicYear: string; startYear: number } | null {
  const $ = load(html);
  const heading = $("h1,h2,h3,h4,h5,h6")
    .toArray()
    .map((element) => normalizeWhitespace($(element).text()))
    .find(
      (text) => headingPattern.test(text) && /\b20\d{2}\s*[–—-]\s*(?:20\d{2}|\d{2})\b/.test(text),
    );
  const match = heading?.match(/\b(20\d{2})\s*[–—-]\s*(20\d{2}|\d{2})\b/);
  if (!match) return null;
  const startYear = Number.parseInt(match[1], 10);
  const endValue = Number.parseInt(match[2], 10);
  const endYear = match[2].length === 2 ? Math.floor(startYear / 100) * 100 + endValue : endValue;
  return endYear === startYear + 1
    ? { academicYear: academicYearLabel(startYear), startYear }
    : null;
}

export function parseSocialEcologyDisplayedUpdate(html: string): string | null {
  const text = normalizeWhitespace(load(html).root().text());
  const match = text.match(MONTH_UPDATE_PATTERN);
  return match
    ? `${match[1][0].toUpperCase()}${match[1].slice(1).toLowerCase()} ${match[2]}`
    : null;
}

export function parseSocialEcologyTermHeader(
  value: string,
  academic: { academicYear: string; startYear: number },
): SocialEcologyTerm | null {
  const header = normalizeWhitespace(value);
  const match = header.match(/^(Fall|Winter|Spring)$/i);
  if (!match) return null;
  const quarter =
    `${match[1][0].toUpperCase()}${match[1].slice(1).toLowerCase()}` as IncludedQuarter;
  const year = String(quarter === "Fall" ? academic.startYear : academic.startYear + 1);
  return { header, academicYear: academic.academicYear, year, quarter };
}

function cellTextWithBoundaries($: ReturnType<typeof load>, cell: Element): string {
  const html =
    $(cell)
      .html()
      ?.replaceAll(/<br\s*\/?>/gi, "\n")
      .replaceAll(/<\/(?:div|p|li|span|section|article)>/gi, "\n")
      .replaceAll(/<\/td>/gi, "\n") ?? "";
  return normalizeWhitespace(load(`<body>${html}</body>`).text().replaceAll(/ +/g, " "));
}

function sourceEntryRegex(config: SocialEcologySourceConfig): RegExp {
  return new RegExp(
    `${config.sourceDepartmentPattern}\\s+(${config.courseNumberPattern})(?=(?:${config.sourceDepartmentPattern})\\s+|[^A-Za-z0-9]|$)`,
    "gi",
  );
}

function stripAllowedAnnotation(value: string): string {
  return value
    .replaceAll(/[-–—]\s*Special\s+Topics/gi, "")
    .replaceAll(/\s+/gu, "")
    .trim();
}

function parseCellEntries(
  $: ReturnType<typeof load>,
  cell: Element,
  config: SocialEcologySourceConfig,
): { courseIds: string[]; errors: string[] } {
  const text = cellTextWithBoundaries($, cell);
  const errors: string[] = [];
  if (!text) return { courseIds: [], errors };
  const regex = sourceEntryRegex(config);
  const courseIds: string[] = [];
  const consumed: Array<[number, number]> = [];
  for (const match of text.matchAll(regex)) {
    const sourceId = normalizeWhitespace(match[0]);
    const courseId = normalizeSocialEcologyCourseId(sourceId, config);
    if (!courseId) {
      errors.push(`malformed course identifier '${sourceId}'`);
      continue;
    }
    courseIds.push(courseId);
    const index = match.index ?? 0;
    consumed.push([index, index + match[0].length]);
  }
  let residual = "";
  let cursor = 0;
  for (const [start, end] of consumed) {
    residual += text.slice(cursor, start);
    cursor = end;
  }
  residual += text.slice(cursor);
  const fragments = residual
    .split(/\n+/u)
    .map((fragment) => stripAllowedAnnotation(fragment))
    .filter(Boolean);
  for (const fragment of fragments)
    errors.push(`unrecognized nonempty schedule fragment '${fragment}'`);
  return { courseIds, errors };
}

export function parseSocialEcologyCourseOfferings(
  html: string,
  config: SocialEcologySourceConfig,
): SocialEcologyParsedPage {
  const $ = load(html);
  const parsingErrors: string[] = [];
  const academic = parseSocialEcologyAcademicYear(html, config.pageHeadingPattern);
  if (!academic) parsingErrors.push("listing is missing a valid 2026-2027 schedule heading");
  const displayedUpdate = parseSocialEcologyDisplayedUpdate(html);
  const scheduleTables = $("table.schedule").toArray();
  if (scheduleTables.length !== 1) {
    parsingErrors.push(
      scheduleTables.length === 0
        ? "listing is missing its qualifying schedule table"
        : `listing has ${scheduleTables.length} qualifying schedule tables`,
    );
  }
  const table = scheduleTables[0];
  const sourceEntriesByQuarter = emptyQuarterCounts();
  const offeringsByQuarter = emptyQuarterCounts();
  const offerings = new Map<string, SocialEcologyOffering>();
  const courseIds = new Set<string>();
  let normalizedEntries = 0;
  let duplicateEntriesCollapsed = 0;
  const terms: SocialEcologyTerm[] = [];
  const tableHeaders = table
    ? $(table)
        .find("thead th")
        .toArray()
        .map((header) => normalizeWhitespace($(header).text()))
    : [];
  const columns = new Map<IncludedQuarter, number>();
  if (academic) {
    for (const quarter of INCLUDED_QUARTERS) {
      const index = tableHeaders.findIndex(
        (header) => header.toLowerCase() === quarter.toLowerCase(),
      );
      if (index < 0)
        parsingErrors.push(`listing is missing the required ${quarter} quarter column`);
      else {
        columns.set(quarter, index);
        terms.push({
          header: quarter,
          academicYear: academic.academicYear,
          year: quarter === "Fall" ? String(academic.startYear) : String(academic.startYear + 1),
          quarter,
        });
      }
    }
  }
  const rows = table ? $(table).find("tbody tr").toArray() : [];
  for (const quarter of INCLUDED_QUARTERS) {
    const column = columns.get(quarter);
    if (column === undefined) continue;
    let sectionHasOffering = false;
    for (const row of rows) {
      const cells = $(row).children("th,td").toArray();
      const cell = cells[column];
      if (!cell) {
        parsingErrors.push(`${quarter} schedule row is missing its cell`);
        continue;
      }
      const result = parseCellEntries($, cell, config);
      if (result.courseIds.length > 0) sectionHasOffering = true;
      sourceEntriesByQuarter[quarter] += result.courseIds.length;
      normalizedEntries += result.courseIds.length;
      parsingErrors.push(...result.errors.map((error) => `${quarter}: ${error}`));
      const term = terms.find((candidate) => candidate.quarter === quarter);
      if (!term) continue;
      for (const courseId of result.courseIds) {
        courseIds.add(courseId);
        const offering: SocialEcologyOffering = { ...term, courseId, instructors: [] };
        const key = offeringKey(offering);
        if (offerings.has(key)) duplicateEntriesCollapsed += 1;
        else {
          offerings.set(key, offering);
          offeringsByQuarter[quarter] += 1;
        }
      }
    }
    if (!sectionHasOffering)
      parsingErrors.push(`listing has an unexpectedly empty ${quarter} quarter`);
  }
  const parsedOfferings = Array.from(offerings.values());
  return {
    sourceEntriesByQuarter,
    normalizedEntries,
    offeringsByQuarter,
    uniqueOfferings: parsedOfferings.length,
    uniqueCourseIds: courseIds.size,
    duplicateEntriesCollapsed,
    courseIds: Array.from(courseIds).toSorted(),
    offerings: parsedOfferings,
    terms,
    academicYear: academic?.academicYear ?? null,
    lastUpdated: null,
    displayedUpdate,
    scheduleTablesDiscovered: scheduleTables.length,
    parsingErrors,
  };
}

export function selectImportableSocialEcologyOfferings(
  parsed: SocialEcologyParsedPage,
  calendarTerms: CalendarTermForImport[],
  now: Date,
): { offerings: SocialEcologyOffering[]; scopes: ImportScope[]; skippedOrStaleTerms: string[] } {
  const calendarByTerm = new Map(calendarTerms.map((term) => [termKey(term), term]));
  const scopeMap = new Map<string, ImportScope>();
  const skipped = new Set<string>();
  for (const term of parsed.terms) {
    const calendar = calendarByTerm.get(termKey(term));
    if (!calendar) skipped.add(`${term.header} (missing calendar metadata)`);
    else if (calendar.instructionStart.getTime() <= now.getTime())
      skipped.add(`${term.header} (term has begun)`);
    else
      scopeMap.set(scopeKey(term), {
        academicYear: term.academicYear,
        year: term.year,
        quarter: term.quarter,
      });
  }
  return {
    offerings: parsed.offerings.filter((offering) => scopeMap.has(scopeKey(offering))),
    scopes: Array.from(scopeMap.values()),
    skippedOrStaleTerms: Array.from(skipped),
  };
}

async function fetchHtml(
  fetcher: typeof fetch,
  config: SocialEcologySourceConfig,
): Promise<string> {
  const response = await fetcher(config.sourceUrl, {
    headers: { "User-Agent": "Anteater API tentative course offerings scraper" },
  });
  if (!response.ok) throw new Error(`Failed to fetch ${config.sourceUrl}: HTTP ${response.status}`);
  return response.text();
}

export async function doSocialEcologyScrape(
  db: ReturnType<typeof database>,
  config: SocialEcologySourceConfig,
  fetcher: typeof fetch = fetch,
  now = new Date(),
): Promise<SocialEcologyScrapeSummary> {
  const parsed = parseSocialEcologyCourseOfferings(await fetchHtml(fetcher, config), config);
  if (
    parsed.academicYear === null ||
    parsed.scheduleTablesDiscovered !== 1 ||
    parsed.terms.length !== INCLUDED_QUARTERS.length ||
    parsed.normalizedEntries === 0
  ) {
    throw new Error(`${config.source} listing did not contain all required quarter data`);
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
  const importable = selectImportableSocialEcologyOfferings(parsed, calendarTerms, now);
  const values: Array<typeof tentativeCourseOffering.$inferInsert> = importable.offerings
    .filter(({ courseId }) => knownCourseIds.has(courseId))
    .map((offering) => ({
      source: config.source,
      sourceUrl: config.sourceUrl,
      academicYear: offering.academicYear,
      courseId: offering.courseId,
      year: offering.year,
      quarter: offering.quarter,
      instructors: [],
      lastUpdated: null,
    }));
  if (importable.offerings.length > 0 && values.length === 0) {
    throw new Error(`${config.source} listing did not contain future offerings for known courses`);
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
              eq(tentativeCourseOffering.source, config.source),
              inArray(tentativeCourseOffering.academicYear, academicYears),
            ),
          )
      : [];
  const relevantExistingRows = existingRows.filter((row) => scopeKeys.has(scopeKey(row)));
  const existingKeys = new Set(relevantExistingRows.map((row) => offeringKey(row)));
  const currentKeys = new Set(values.map((value) => offeringKey(value)));
  const rowsInserted = Array.from(currentKeys).filter((key) => !existingKeys.has(key)).length;
  const rowsUpdated = Array.from(currentKeys).filter((key) => existingKeys.has(key)).length;
  const sourceCurrentKeys = new Set(importable.offerings.map((offering) => offeringKey(offering)));
  for (const row of relevantExistingRows) {
    if (unmatchedCourseIds.includes(row.courseId)) sourceCurrentKeys.add(offeringKey(row));
  }
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
          eq(tentativeCourseOffering.source, config.source),
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
  const summary: SocialEcologyScrapeSummary = {
    sourceEntriesByQuarter: parsed.sourceEntriesByQuarter,
    normalizedEntries: parsed.normalizedEntries,
    offeringsByQuarter: parsed.offeringsByQuarter,
    uniqueOfferings: parsed.uniqueOfferings,
    uniqueCourseIds: parsed.uniqueCourseIds,
    duplicateEntriesCollapsed: parsed.duplicateEntriesCollapsed,
    matchedCourseIds,
    unmatchedCourseIds,
    rowsInserted,
    rowsUpdated,
    rowsDeactivated,
    displayedUpdate: parsed.displayedUpdate,
    lastUpdated: null,
    skippedOrStaleTerms: importable.skippedOrStaleTerms,
    parsingErrors: parsed.parsingErrors,
  };
  console.log(JSON.stringify(summary));
  return summary;
}
