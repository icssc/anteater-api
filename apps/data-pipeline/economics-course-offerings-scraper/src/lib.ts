import type { database } from "@packages/db";
import { and, eq, inArray, notInArray } from "@packages/db/drizzle";
import type { Term } from "@packages/db/schema";
import { calendarTerm, course, tentativeCourseOffering } from "@packages/db/schema";
import { conflictUpdateSetAllCols } from "@packages/db/utils";
import { type Cheerio, load } from "cheerio";
import type { Element } from "domhandler";

export const ECONOMICS_COURSE_OFFERINGS_SOURCE = "ECONOMICS_COURSE_OFFERINGS";
export const ECONOMICS_COURSE_OFFERINGS_URL =
  "https://www.economics.uci.edu/undergrad/courses/list.php";

const INCLUDED_QUARTERS = ["Fall", "Winter", "Spring"] as const;
type IncludedQuarter = (typeof INCLUDED_QUARTERS)[number];

const CHECKMARKS = new Set(["✓", "✔", "☑", "✅"]);

export type ParsedEconomicsTerm = {
  header: string;
  academicYear: string;
  year: string;
  quarter: IncludedQuarter;
};

export type ParsedEconomicsCourseOffering = Omit<ParsedEconomicsTerm, "header"> & {
  courseId: string;
  instructors: [];
};

export type ParsedEconomicsCourseOfferingsPage = {
  scheduleTablesDiscovered: number;
  categoryNamesDiscovered: string[];
  sourceTableRows: number;
  normalizedCourseRows: number;
  offeringsByQuarter: Record<IncludedQuarter, number>;
  duplicateRowsCollapsed: number;
  courseIds: string[];
  offerings: ParsedEconomicsCourseOffering[];
  terms: ParsedEconomicsTerm[];
  academicYear: string | null;
  lastUpdated: null;
  parsingErrors: string[];
};

export type EconomicsScrapeSummary = {
  scheduleTablesDiscovered: number;
  categoryNamesDiscovered: string[];
  sourceTableRows: number;
  normalizedCourseRows: number;
  offeringsByQuarter: Record<IncludedQuarter, number>;
  uniqueOfferings: number;
  uniqueCourseIds: number;
  duplicateRowsCollapsed: number;
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

type ImportScope = Omit<ParsedEconomicsTerm, "header">;

type ImportableEconomicsOfferings = {
  offerings: ParsedEconomicsCourseOffering[];
  scopes: ImportScope[];
  skippedOrStaleTerms: string[];
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

const offeringKey = (offering: ParsedEconomicsCourseOffering) =>
  `${scopeKey(offering)}|${offering.courseId}`;

function emptyOfferingCounts(): Record<IncludedQuarter, number> {
  return { Fall: 0, Winter: 0, Spring: 0 };
}

export function normalizeEconomicsText(value: string): string {
  return normalizeWhitespace(value);
}

export function normalizeEconomicsCourseId(sourceCourseId: string): string | null {
  const normalized = normalizeEconomicsText(sourceCourseId.toUpperCase()).replaceAll(" ", "");
  const match = normalized.match(/^(H?)(\d+)([A-Z]*)$/);
  if (!match) return null;

  const numeric = Number.parseInt(match[2], 10);
  if (!Number.isInteger(numeric)) return null;
  return `ECON${match[1]}${numeric}${match[3]}`;
}

export function parseEconomicsAcademicYear(html: string): {
  academicYear: string;
  startYear: number;
} | null {
  const $ = load(html);
  const headings = $("h1, h2, h3, h4, h5, h6")
    .toArray()
    .map((heading) => normalizeEconomicsText($(heading).text()));
  const heading = headings.find((value) => /^Tentative Schedule\s+20\d{2}/i.test(value));
  const match = heading?.match(/^Tentative Schedule\s+(20\d{2})\s*[-–—](20\d{2}|\d{2})$/i);
  if (!match) return null;

  const startYear = Number.parseInt(match[1], 10);
  const endYearValue = Number.parseInt(match[2], 10);
  const endYear =
    match[2].length === 2 ? Math.floor(startYear / 100) * 100 + endYearValue : endYearValue;
  if (endYear !== startYear + 1) return null;
  return { academicYear: academicYearLabel(startYear), startYear };
}

export function parseEconomicsTermHeader(
  value: string,
  academicYear: string,
): ParsedEconomicsTerm | null {
  const header = normalizeEconomicsText(value);
  const match = header.match(/^(Fall|Winter|Spring)\s+(20\d{2})$/i);
  if (!match) return null;
  const quarter = `${match[1][0].toUpperCase()}${match[1]
    .slice(1)
    .toLocaleLowerCase()}` as IncludedQuarter;
  return { header, academicYear, year: match[2], quarter };
}

function isCheckmark(value: string): boolean {
  return CHECKMARKS.has(normalizeEconomicsText(value));
}

function tableHeaders($: ReturnType<typeof load>, table: Cheerio<Element>): string[] {
  return $(table)
    .find("thead tr")
    .first()
    .children("th, td")
    .toArray()
    .map((cell) => normalizeEconomicsText($(cell).text()));
}

export function parseEconomicsCourseOfferings(html: string): ParsedEconomicsCourseOfferingsPage {
  const $ = load(html);
  const academic = parseEconomicsAcademicYear(html);
  const parsingErrors: string[] = [];
  if (!academic)
    parsingErrors.push("Economics listing is missing a valid tentative-schedule heading");

  const heading = $("h1, h2, h3, h4, h5, h6")
    .toArray()
    .find((element) =>
      normalizeEconomicsText($(element).text()).match(/^Tentative Schedule\s+20\d{2}/i),
    );
  const scheduleRoot = heading ? $(heading).parent().first() : null;
  const tableCandidates = scheduleRoot
    ? $(scheduleRoot)
        .find("table")
        .toArray()
        .map((table) => ({
          table,
          caption: normalizeEconomicsText($(table).find("caption").first().text()),
          headers: tableHeaders($, $(table)),
        }))
        .filter(
          ({ caption, headers }) =>
            caption.length > 0 &&
            headers.some((header) => header.toLocaleLowerCase() === "course number") &&
            headers.some((header) => header.toLocaleLowerCase() === "course name"),
        )
    : [];

  const categoryNamesDiscovered = tableCandidates.map(({ caption }) => caption);
  if (tableCandidates.length === 0) {
    parsingErrors.push("Economics listing is missing qualifying tentative schedule tables");
  }

  const offerings = new Map<string, ParsedEconomicsCourseOffering>();
  const courseIds = new Set<string>();
  const offeringsByQuarter = emptyOfferingCounts();
  const termsByQuarter = new Map<IncludedQuarter, ParsedEconomicsTerm & { columnIndex: number }>();
  let sourceTableRows = 0;
  let normalizedCourseRows = 0;
  let duplicateRowsCollapsed = 0;

  for (const { caption, table, headers } of tableCandidates) {
    const normalizedHeaders = headers.map((header) => header.toLocaleLowerCase());
    const courseColumn = normalizedHeaders.indexOf("course number");
    const titleColumn = normalizedHeaders.indexOf("course name");

    if (!academic) continue;
    for (const [columnIndex, header] of headers.entries()) {
      const term = parseEconomicsTermHeader(header, academic.academicYear);
      if (!term) continue;
      if (termsByQuarter.has(term.quarter)) {
        const existing = termsByQuarter.get(term.quarter);
        if (existing?.columnIndex !== columnIndex) {
          // Every qualifying category table repeats the same quarter headers.
          continue;
        }
      }
      const expectedYear = term.quarter === "Fall" ? academic.startYear : academic.startYear + 1;
      if (term.year !== expectedYear.toString(10)) {
        parsingErrors.push(
          `Economics ${term.header} column in ${caption} does not belong to academic year ${academic.academicYear}`,
        );
        continue;
      }
      if (!termsByQuarter.has(term.quarter)) {
        termsByQuarter.set(term.quarter, { ...term, columnIndex });
      }
    }

    const tableTerms = new Map<IncludedQuarter, ParsedEconomicsTerm & { columnIndex: number }>();
    for (const [columnIndex, header] of headers.entries()) {
      const term = parseEconomicsTermHeader(header, academic.academicYear);
      if (!term) continue;
      const expectedYear = term.quarter === "Fall" ? academic.startYear : academic.startYear + 1;
      if (term.year === expectedYear.toString(10) && !tableTerms.has(term.quarter)) {
        tableTerms.set(term.quarter, { ...term, columnIndex });
      }
    }
    for (const quarter of INCLUDED_QUARTERS) {
      if (!tableTerms.has(quarter)) {
        parsingErrors.push(`Economics ${caption} table is missing its required ${quarter} column`);
      }
    }

    const rows = $(table).find("tbody tr").toArray();
    for (const [rowIndex, row] of rows.entries()) {
      const cells = $(row).children("th, td");
      const values = cells.toArray().map((cell) => normalizeEconomicsText($(cell).text()));
      if (values.every((value) => value.length === 0)) continue;
      sourceTableRows += 1;

      const requiredIndices = [
        courseColumn,
        titleColumn,
        ...Array.from(tableTerms.values()).map(({ columnIndex }) => columnIndex),
      ];
      const maxIndex = Math.max(-1, ...requiredIndices);
      if (courseColumn < 0 || titleColumn < 0 || cells.length <= maxIndex) {
        parsingErrors.push(`Economics ${caption} row ${rowIndex + 1} is missing required cells`);
        continue;
      }

      const sourceCourseId = values[courseColumn];
      const courseId = normalizeEconomicsCourseId(sourceCourseId);
      if (!courseId) {
        parsingErrors.push(
          `Economics ${caption} row ${rowIndex + 1} has malformed course identifier '${sourceCourseId}'`,
        );
        continue;
      }
      normalizedCourseRows += 1;
      courseIds.add(courseId);

      for (const quarter of INCLUDED_QUARTERS) {
        const term = tableTerms.get(quarter);
        if (!term) continue;
        const marker = values[term.columnIndex];
        if (marker.length === 0) continue;
        if (!isCheckmark(marker)) {
          parsingErrors.push(
            `Economics ${caption} row ${rowIndex + 1} ${quarter} cell has unexpected marker '${marker}'`,
          );
          continue;
        }

        const offering: ParsedEconomicsCourseOffering = {
          academicYear: term.academicYear,
          courseId,
          year: term.year,
          quarter,
          instructors: [],
        };
        const key = offeringKey(offering);
        if (offerings.has(key)) duplicateRowsCollapsed += 1;
        else {
          offerings.set(key, offering);
          offeringsByQuarter[quarter] += 1;
        }
      }
    }
  }

  for (const quarter of INCLUDED_QUARTERS) {
    if (!termsByQuarter.has(quarter)) {
      parsingErrors.push(`Economics listing is missing its required ${quarter} column`);
    }
    if (offeringsByQuarter[quarter] === 0) {
      parsingErrors.push(`Economics listing has no usable ${quarter} offerings`);
    }
  }

  return {
    scheduleTablesDiscovered: tableCandidates.length,
    categoryNamesDiscovered,
    sourceTableRows,
    normalizedCourseRows,
    offeringsByQuarter,
    duplicateRowsCollapsed,
    courseIds: Array.from(courseIds).toSorted(),
    offerings: Array.from(offerings.values()),
    terms: INCLUDED_QUARTERS.flatMap((quarter) => {
      const term = termsByQuarter.get(quarter);
      if (!term) return [];
      const { columnIndex: _, ...parsedTerm } = term;
      return [parsedTerm];
    }),
    academicYear: academic?.academicYear ?? null,
    lastUpdated: null,
    parsingErrors,
  };
}

export function selectImportableEconomicsOfferings(
  parsed: ParsedEconomicsCourseOfferingsPage,
  calendarTerms: CalendarTermForImport[],
  now: Date,
): ImportableEconomicsOfferings {
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
  const response = await fetcher(ECONOMICS_COURSE_OFFERINGS_URL, {
    headers: {
      "User-Agent": "Anteater API tentative course offerings scraper",
    },
  });
  if (!response.ok) {
    throw new Error(`Failed to fetch ${ECONOMICS_COURSE_OFFERINGS_URL}: HTTP ${response.status}`);
  }
  return await response.text();
}

export async function doScrape(
  db: ReturnType<typeof database>,
  fetcher: typeof fetch = fetch,
  now = new Date(),
): Promise<EconomicsScrapeSummary> {
  const html = await fetchHtml(fetcher);
  const parsed = parseEconomicsCourseOfferings(html);
  if (
    parsed.academicYear === null ||
    parsed.scheduleTablesDiscovered === 0 ||
    parsed.terms.length === 0
  ) {
    throw new Error("Economics listing did not contain a usable tentative schedule");
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
  const importable = selectImportableEconomicsOfferings(parsed, calendarTerms, now);
  const values: Array<typeof tentativeCourseOffering.$inferInsert> = importable.offerings
    .filter(({ courseId }) => knownCourseIds.has(courseId))
    .map((offering) => ({
      source: ECONOMICS_COURSE_OFFERINGS_SOURCE,
      sourceUrl: ECONOMICS_COURSE_OFFERINGS_URL,
      academicYear: offering.academicYear,
      courseId: offering.courseId,
      year: offering.year,
      quarter: offering.quarter,
      instructors: [],
      lastUpdated: null,
    }));

  if (importable.offerings.length > 0 && values.length === 0) {
    throw new Error(
      "Economics listing did not contain future offerings for any known Anteater API courses",
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
              eq(tentativeCourseOffering.source, ECONOMICS_COURSE_OFFERINGS_SOURCE),
              inArray(tentativeCourseOffering.academicYear, academicYears),
            ),
          )
      : [];
  const relevantExistingRows = existingRows.filter((row) => scopeKeys.has(scopeKey(row)));
  const existingKeys = new Set(
    relevantExistingRows.map((row) =>
      offeringKey({ ...row, instructors: [] } as ParsedEconomicsCourseOffering),
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
          eq(tentativeCourseOffering.source, ECONOMICS_COURSE_OFFERINGS_SOURCE),
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

  const summary: EconomicsScrapeSummary = {
    scheduleTablesDiscovered: parsed.scheduleTablesDiscovered,
    categoryNamesDiscovered: parsed.categoryNamesDiscovered,
    sourceTableRows: parsed.sourceTableRows,
    normalizedCourseRows: parsed.normalizedCourseRows,
    offeringsByQuarter: parsed.offeringsByQuarter,
    uniqueOfferings: parsed.offerings.length,
    uniqueCourseIds: parsed.courseIds.length,
    duplicateRowsCollapsed: parsed.duplicateRowsCollapsed,
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
