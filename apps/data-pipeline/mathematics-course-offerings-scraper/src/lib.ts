import type { database } from "@packages/db";
import { and, eq, inArray, notInArray } from "@packages/db/drizzle";
import type { Term } from "@packages/db/schema";
import { calendarTerm, course, tentativeCourseOffering } from "@packages/db/schema";
import { conflictUpdateSetAllCols } from "@packages/db/utils";
import { load } from "cheerio";

export const MATHEMATICS_COURSE_OFFERINGS_SOURCE = "MATHEMATICS_COURSE_OFFERINGS";
export const MATHEMATICS_COURSE_OFFERINGS_URL =
  "https://www.math.uci.edu/undergrad-courses/plan-math-course-offerings";

const INCLUDED_QUARTERS = ["Fall", "Winter", "Spring"] as const;
type IncludedQuarter = (typeof INCLUDED_QUARTERS)[number];

export type ParsedMathTerm = {
  header: IncludedQuarter;
  academicYear: string;
  year: string;
  quarter: IncludedQuarter;
};

export type ParsedMathCourseOffering = Omit<ParsedMathTerm, "header"> & {
  courseId: string;
  instructors: [];
};

export type ParsedMathSection = {
  name: string;
  terms: ParsedMathTerm[];
};

export type ParsedMathCourseOfferingsPage = {
  sourceRowsParsed: number;
  expandedCourseRows: number;
  courseIds: string[];
  offerings: ParsedMathCourseOffering[];
  sections: ParsedMathSection[];
  academicYear: string;
  lastUpdated: Date | null;
  parsingErrors: string[];
};

export type MathScrapeSummary = {
  sourceRowsParsed: number;
  expandedCourseRows: number;
  uniqueOfferings: number;
  matchedCourseIds: string[];
  unmatchedCourseIds: string[];
  rowsInserted: number;
  rowsUpdated: number;
  rowsDeactivated: number;
  skippedOrStaleTerms: string[];
  parsingErrors: string[];
};

type CalendarTermForImport = {
  year: string;
  quarter: Term;
  instructionStart: Date;
};

type ImportScope = Omit<ParsedMathTerm, "header">;

type ImportableMathOfferings = {
  offerings: ParsedMathCourseOffering[];
  scopes: ImportScope[];
  skippedOrStaleTerms: string[];
};

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

const normalizeWhitespace = (value: string) => value.replaceAll(/\s+/g, " ").trim();

const academicYearLabel = (startYear: number) => `${startYear}-${startYear + 1}`;

const termKey = (term: { year: string; quarter: string }) => `${term.year} ${term.quarter}`;

const scopeKey = (term: { academicYear: string; year: string; quarter: string }) =>
  `${term.academicYear}|${termKey(term)}`;

const offeringKey = (offering: ParsedMathCourseOffering) =>
  `${scopeKey(offering)}|${offering.courseId}`;

export function normalizeMathCourseId(sourceCourseId: string): string | null {
  const source = normalizeWhitespace(sourceCourseId.toUpperCase());
  const unprefixed = source.replace(/^MATH\s+/, "").replace(/\*+$/, "");
  // Spaces are valid only between an explicit MATH department prefix and its course number.
  // This prevents another department such as "CHEM 1A" from becoming MATHCHEM1A.
  if (/\s/.test(unprefixed)) return null;
  const normalized = unprefixed;
  const match = normalized.match(/^([A-Z]*)(\d+)([A-Z]*)$/);
  if (!match) return null;

  const numeric = Number.parseInt(match[2], 10);
  if (!Number.isInteger(numeric)) return null;
  return `MATH${match[1]}${numeric}${match[3]}`;
}

export function expandMathCourseIds(sourceCourseIds: string): string[] {
  const parts = normalizeWhitespace(sourceCourseIds).split(/\s*(?:\/|&)\s*/);
  const normalized = parts.map(normalizeMathCourseId);
  if (normalized.some((courseId) => courseId === null)) return [];
  return Array.from(new Set(normalized as string[]));
}

function parseAcademicYear(html: string): { academicYear: string; startYear: number } {
  const $ = load(html);
  const text = normalizeWhitespace($.root().text());
  const match = text.match(/\b(20\d{2})\s*[-–—]\s*(20\d{2}|\d{2})\s+Academic Year\b/i);
  if (!match) {
    throw new Error("Mathematics course offerings page did not contain a valid academic year");
  }

  const startYear = Number.parseInt(match[1], 10);
  const endYearValue = Number.parseInt(match[2], 10);
  const endYear =
    match[2].length === 2 ? Math.floor(startYear / 100) * 100 + endYearValue : endYearValue;
  if (endYear !== startYear + 1) {
    throw new Error(`Mathematics listing has nonconsecutive academic year ${match[1]}-${match[2]}`);
  }
  return { academicYear: academicYearLabel(startYear), startYear };
}

function parseLastUpdated(html: string): Date | null {
  const $ = load(html);
  const text = normalizeWhitespace($.root().text());
  const match = text.match(/\bLast updated\s+([A-Za-z]+)\s+(\d{1,2}),\s+(\d{4})\b/i);
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

function parsedTerm(
  header: IncludedQuarter,
  academicYear: string,
  startYear: number,
): ParsedMathTerm {
  return {
    header,
    academicYear,
    year: (header === "Fall" ? startYear : startYear + 1).toString(10),
    quarter: header,
  };
}

export function parseMathCourseOfferings(html: string): ParsedMathCourseOfferingsPage {
  const $ = load(html);
  const { academicYear, startYear } = parseAcademicYear(html);
  const offerings = new Map<string, ParsedMathCourseOffering>();
  const courseIds = new Set<string>();
  const sections: ParsedMathSection[] = [];
  const parsingErrors: string[] = [];
  let sourceRowsParsed = 0;
  let expandedCourseRows = 0;

  $("table").each((tableIndex, table) => {
    const rows = $(table).find("tr");
    let headerRowIndex = -1;
    let headers: string[] = [];
    rows.each((rowIndex, row) => {
      if (headerRowIndex !== -1) return;
      const candidate = $(row)
        .children("th, td")
        .toArray()
        .map((cell) => normalizeWhitespace($(cell).text()).toLocaleLowerCase());
      if (candidate.includes("course") && candidate.includes("title")) {
        headerRowIndex = rowIndex;
        headers = candidate;
      }
    });
    if (headerRowIndex === -1) return;

    const sectionName =
      normalizeWhitespace($(table).prevAll("h2").first().text()) || `table ${tableIndex + 1}`;
    const courseColumnIndex = headers.indexOf("course");
    const termColumns: Array<ParsedMathTerm & { columnIndex: number; marker: string }> = [];
    for (const quarter of INCLUDED_QUARTERS) {
      const columnIndex = headers.indexOf(quarter.toLocaleLowerCase());
      if (columnIndex === -1) {
        parsingErrors.push(`${sectionName}: missing ${quarter} column`);
        continue;
      }
      termColumns.push({
        ...parsedTerm(quarter, academicYear, startYear),
        columnIndex,
        marker: quarter[0],
      });
    }
    if (termColumns.length !== INCLUDED_QUARTERS.length) return;

    sections.push({
      name: sectionName,
      terms: termColumns.map(({ columnIndex: _, marker: __, ...term }) => term),
    });

    rows.slice(headerRowIndex + 1).each((rowIndex, row) => {
      const cells = $(row).children("td");
      const sourceCourseId = normalizeWhitespace(cells.eq(courseColumnIndex).text());
      if (!sourceCourseId) return;

      sourceRowsParsed += 1;
      const expandedIds = expandMathCourseIds(sourceCourseId);
      if (expandedIds.length === 0) {
        parsingErrors.push(
          `${sectionName} row ${rowIndex + 1}: unrecognized course identifier '${sourceCourseId}'`,
        );
        return;
      }
      expandedCourseRows += expandedIds.length;
      for (const courseId of expandedIds) courseIds.add(courseId);

      for (const term of termColumns) {
        const cell = cells.eq(term.columnIndex);
        if (cell.length === 0) {
          parsingErrors.push(
            `${sectionName} row ${rowIndex + 1}: missing ${term.header} availability cell`,
          );
          continue;
        }

        const availability = normalizeWhitespace(cell.text()).toUpperCase();
        if (!availability) continue;
        if (availability !== term.marker) {
          parsingErrors.push(
            `${sectionName} row ${rowIndex + 1}: unrecognized ${term.header} availability '${availability}'`,
          );
          continue;
        }

        for (const courseId of expandedIds) {
          const offering: ParsedMathCourseOffering = {
            academicYear: term.academicYear,
            courseId,
            year: term.year,
            quarter: term.quarter,
            instructors: [],
          };
          offerings.set(offeringKey(offering), offering);
        }
      }
    });
  });

  if (sections.length === 0) {
    throw new Error("Mathematics course offerings page did not contain a course offerings table");
  }
  for (const requiredSection of ["Lower-Division", "Upper-Division"]) {
    if (!sections.some(({ name }) => name.includes(requiredSection))) {
      parsingErrors.push(`Mathematics listing is missing its ${requiredSection} offerings table`);
    }
  }

  const lastUpdated = parseLastUpdated(html);
  if (/Last updated/i.test($.root().text()) && !lastUpdated) {
    parsingErrors.push("Could not parse the page's Last updated value");
  }

  return {
    sourceRowsParsed,
    expandedCourseRows,
    courseIds: Array.from(courseIds).toSorted(),
    offerings: Array.from(offerings.values()),
    sections,
    academicYear,
    lastUpdated,
    parsingErrors,
  };
}

export function selectImportableMathOfferings(
  parsed: ParsedMathCourseOfferingsPage,
  calendarTerms: CalendarTermForImport[],
  now: Date,
): ImportableMathOfferings {
  const calendarByTerm = new Map(calendarTerms.map((term) => [termKey(term), term]));
  const importableScopeKeys = new Set<string>();
  const scopes = new Map<string, ImportScope>();
  const skippedOrStaleTerms = new Set<string>();

  for (const section of parsed.sections) {
    for (const term of section.terms) {
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
  }

  return {
    offerings: parsed.offerings.filter((offering) => importableScopeKeys.has(scopeKey(offering))),
    scopes: Array.from(scopes.values()),
    skippedOrStaleTerms: Array.from(skippedOrStaleTerms),
  };
}

async function fetchHtml(fetcher: typeof fetch): Promise<string> {
  const response = await fetcher(MATHEMATICS_COURSE_OFFERINGS_URL, {
    headers: { "User-Agent": "Anteater API tentative course offerings scraper" },
  });
  if (!response.ok) {
    throw new Error(`Failed to fetch ${MATHEMATICS_COURSE_OFFERINGS_URL}: HTTP ${response.status}`);
  }
  return await response.text();
}

export async function doScrape(
  db: ReturnType<typeof database>,
  fetcher: typeof fetch = fetch,
  now = new Date(),
): Promise<MathScrapeSummary> {
  const html = await fetchHtml(fetcher);
  const parsed = parseMathCourseOfferings(html);
  if (parsed.sourceRowsParsed === 0) {
    throw new Error("Mathematics listing did not contain any course rows");
  }

  const sourceYears = Array.from(
    new Set(parsed.sections.flatMap(({ terms }) => terms.map(({ year }) => year))),
  );
  const [knownCourses, calendarTerms] = await Promise.all([
    parsed.courseIds.length > 0
      ? db.select({ id: course.id }).from(course).where(inArray(course.id, parsed.courseIds))
      : Promise.resolve([]),
    sourceYears.length > 0
      ? db
          .select({
            year: calendarTerm.year,
            quarter: calendarTerm.quarter,
            instructionStart: calendarTerm.instructionStart,
          })
          .from(calendarTerm)
          .where(inArray(calendarTerm.year, sourceYears))
      : Promise.resolve([]),
  ]);
  const knownCourseIds = new Set(knownCourses.map(({ id }) => id));
  const matchedCourseIds = parsed.courseIds.filter((id) => knownCourseIds.has(id));
  const unmatchedCourseIds = parsed.courseIds.filter((id) => !knownCourseIds.has(id));
  const importable = selectImportableMathOfferings(parsed, calendarTerms, now);
  const values: Array<typeof tentativeCourseOffering.$inferInsert> = importable.offerings
    .filter(({ courseId }) => knownCourseIds.has(courseId))
    .map((offering) => ({
      source: MATHEMATICS_COURSE_OFFERINGS_SOURCE,
      sourceUrl: MATHEMATICS_COURSE_OFFERINGS_URL,
      academicYear: offering.academicYear,
      courseId: offering.courseId,
      year: offering.year,
      quarter: offering.quarter,
      instructors: offering.instructors,
      lastUpdated: parsed.lastUpdated,
    }));

  if (importable.offerings.length > 0 && values.length === 0) {
    throw new Error(
      "Mathematics listing did not contain future offerings for any known Anteater API courses",
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
              eq(tentativeCourseOffering.source, MATHEMATICS_COURSE_OFFERINGS_SOURCE),
              inArray(tentativeCourseOffering.academicYear, academicYears),
            ),
          )
      : [];
  const relevantExistingRows = existingRows.filter((row) => scopeKeys.has(scopeKey(row)));
  const existingKeys = new Set(
    relevantExistingRows.map((row) =>
      offeringKey({ ...row, instructors: [] } as ParsedMathCourseOffering),
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
  // A partial source snapshot can still refresh recovered rows, but it must never remove old data.
  // This table has no active flag, so scoped deletion is the source's deactivation operation.
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
          eq(tentativeCourseOffering.source, MATHEMATICS_COURSE_OFFERINGS_SOURCE),
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

  const summary: MathScrapeSummary = {
    sourceRowsParsed: parsed.sourceRowsParsed,
    expandedCourseRows: parsed.expandedCourseRows,
    uniqueOfferings: parsed.offerings.length,
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
