import type { database } from "@packages/db";
import { and, eq, inArray, notInArray } from "@packages/db/drizzle";
import type { Term } from "@packages/db/schema";
import { calendarTerm, course, tentativeCourseOffering } from "@packages/db/schema";
import { conflictUpdateSetAllCols } from "@packages/db/utils";
import { type Cheerio, load } from "cheerio";
import type { Element } from "domhandler";

export const POLITICAL_SCIENCE_COURSE_OFFERINGS_SOURCE = "POLITICAL_SCIENCE_COURSE_OFFERINGS";
export const POLITICAL_SCIENCE_COURSE_OFFERINGS_URL =
  "https://www.polisci.uci.edu/undergrad/courses.php";

const INCLUDED_QUARTERS = ["Fall", "Winter", "Spring"] as const;
type IncludedQuarter = (typeof INCLUDED_QUARTERS)[number];

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

export type ParsedPoliticalScienceTerm = {
  header: string;
  academicYear: string;
  year: string;
  quarter: IncludedQuarter;
};

export type ParsedPoliticalScienceCourseOffering = Omit<ParsedPoliticalScienceTerm, "header"> & {
  courseId: string;
  instructors: [];
};

export type ParsedPoliticalScienceCourseOfferingsPage = {
  sourceRowsByQuarter: Record<IncludedQuarter, number>;
  normalizedRowsByQuarter: Record<IncludedQuarter, number>;
  offeringsByQuarter: Record<IncludedQuarter, number>;
  duplicateTopicRowsCollapsedByQuarter: Record<IncludedQuarter, number>;
  scheduleTablesDiscovered: number;
  courseIds: string[];
  offerings: ParsedPoliticalScienceCourseOffering[];
  terms: ParsedPoliticalScienceTerm[];
  academicYear: string | null;
  lastUpdated: Date | null;
  parsingErrors: string[];
};

export type PoliticalScienceScrapeSummary = {
  fallSourceRows: number;
  winterSourceRows: number;
  springSourceRows: number;
  normalizedRows: number;
  offeringsByQuarter: Record<IncludedQuarter, number>;
  uniqueOfferings: number;
  uniqueCourseIds: number;
  duplicateTopicRowsCollapsedByQuarter: Record<IncludedQuarter, number>;
  displayedSourceUpdateDate: Date | null;
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

type ImportScope = Omit<ParsedPoliticalScienceTerm, "header">;

type ImportablePoliticalScienceOfferings = {
  offerings: ParsedPoliticalScienceCourseOffering[];
  scopes: ImportScope[];
  skippedOrStaleTerms: string[];
};

type ParsedSectionCaption = {
  header: string;
  quarter: IncludedQuarter;
  year: string;
};

type SectionCandidate = {
  table: Cheerio<Element>;
  caption: ParsedSectionCaption;
  headers: string[];
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

const offeringKey = (offering: ParsedPoliticalScienceCourseOffering) =>
  `${scopeKey(offering)}|${offering.courseId}`;

function emptyQuarterCounts(): Record<IncludedQuarter, number> {
  return { Fall: 0, Winter: 0, Spring: 0 };
}

export function normalizePoliticalScienceText(value: string): string {
  return normalizeWhitespace(value);
}

export function normalizePoliticalScienceCourseId(sourceCourseId: string): string | null {
  let normalized = normalizePoliticalScienceText(sourceCourseId.toUpperCase());
  normalized = normalized.replace(/\s*\[(ONLINE|HYBRID)\]\s*$/i, "");

  const departmentMatch = normalized.match(/^(POL SCI|POLI SCI)\s+(.+)$/i);
  if (!departmentMatch) return null;

  const courseNumber = departmentMatch[2].replaceAll(" ", "");
  const numberMatch = courseNumber.match(/^(H?)(\d+)([A-Z]*)$/);
  if (!numberMatch) return null;

  const numeric = Number.parseInt(numberMatch[2], 10);
  if (!Number.isInteger(numeric)) return null;
  return `POLSCI${numberMatch[1]}${numeric}${numberMatch[3]}`;
}

export function parsePoliticalScienceAcademicYear(html: string): {
  academicYear: string;
  startYear: number;
} | null {
  const $ = load(html);
  const headings = $("h1, h2, h3, h4, h5, h6")
    .toArray()
    .map((heading) => normalizePoliticalScienceText($(heading).text()));
  const heading = headings.find((value) =>
    /^Course Offerings Schedule Academic School Year\s+20\d{2}/i.test(value),
  );
  const match = heading?.match(
    /^Course Offerings Schedule Academic School Year\s+(20\d{2})\s*[-–—](20\d{2}|\d{2})$/i,
  );
  if (!match) return null;

  const startYear = Number.parseInt(match[1], 10);
  const endYearValue = Number.parseInt(match[2], 10);
  const endYear =
    match[2].length === 2 ? Math.floor(startYear / 100) * 100 + endYearValue : endYearValue;
  if (endYear !== startYear + 1) return null;
  return { academicYear: academicYearLabel(startYear), startYear };
}

export function parsePoliticalScienceLastUpdated(html: string): Date | null {
  const $ = load(html);
  const text = normalizePoliticalScienceText($.root().text());
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

export function parsePoliticalScienceSectionCaption(value: string): ParsedSectionCaption | null {
  const header = normalizePoliticalScienceText(value);
  const match = header.match(/^(FALL|WINTER|SPRING)\s+QUARTER\s+(20\d{2})$/i);
  if (!match) return null;
  const quarter = `${match[1][0].toUpperCase()}${match[1]
    .slice(1)
    .toLocaleLowerCase()}` as IncludedQuarter;
  return { header, quarter, year: match[2] };
}

function tableHeaders($: ReturnType<typeof load>, table: Cheerio<Element>): string[] {
  return $(table)
    .find("thead tr")
    .first()
    .children("th, td")
    .toArray()
    .map((cell) => normalizePoliticalScienceText($(cell).text()));
}

function termsForSections(
  sections: SectionCandidate[],
  academic: { academicYear: string; startYear: number } | null,
  parsingErrors: string[],
): Map<IncludedQuarter, ParsedPoliticalScienceTerm> {
  const terms = new Map<IncludedQuarter, ParsedPoliticalScienceTerm>();
  for (const section of sections) {
    if (!academic) continue;
    const expectedYear =
      section.caption.quarter === "Fall" ? academic.startYear : academic.startYear + 1;
    if (section.caption.year !== expectedYear.toString(10)) {
      parsingErrors.push(
        `Political Science ${section.caption.header} section does not belong to academic year ${academic.academicYear}`,
      );
      continue;
    }
    if (terms.has(section.caption.quarter)) {
      parsingErrors.push(
        `Political Science listing has duplicate ${section.caption.quarter} sections`,
      );
      continue;
    }
    terms.set(section.caption.quarter, {
      header: section.caption.header,
      academicYear: academic.academicYear,
      year: section.caption.year,
      quarter: section.caption.quarter,
    });
  }
  return terms;
}

export function parsePoliticalScienceCourseOfferings(
  html: string,
): ParsedPoliticalScienceCourseOfferingsPage {
  const $ = load(html);
  const academic = parsePoliticalScienceAcademicYear(html);
  const parsingErrors: string[] = [];
  if (!academic) {
    parsingErrors.push(
      "Political Science listing is missing a valid academic-year schedule heading",
    );
  }

  const heading = $("h1, h2, h3, h4, h5, h6")
    .toArray()
    .find((element) =>
      /^Course Offerings Schedule Academic School Year\s+20\d{2}/i.test(
        normalizePoliticalScienceText($(element).text()),
      ),
    );
  const scheduleRoot = heading ? $(heading).parent().first() : null;
  const sections = scheduleRoot
    ? $(scheduleRoot)
        .find("table")
        .toArray()
        .map((table) => ({
          table: $(table),
          caption: parsePoliticalScienceSectionCaption($(table).find("caption").first().text()),
          headers: tableHeaders($, $(table)),
        }))
        .filter((candidate): candidate is SectionCandidate => candidate.caption !== null)
    : [];

  const terms = termsForSections(sections, academic, parsingErrors);
  for (const quarter of INCLUDED_QUARTERS) {
    const section = sections.find(({ caption }) => caption.quarter === quarter);
    if (!section) {
      parsingErrors.push(`Political Science listing is missing its ${quarter} quarter table`);
      continue;
    }
    if (!terms.has(quarter)) continue;
    const normalizedHeaders = section.headers.map((header) => header.toLocaleLowerCase());
    if (
      !normalizedHeaders.includes("course number") ||
      !normalizedHeaders.includes("course title")
    ) {
      parsingErrors.push(
        `Political Science ${quarter} table is missing its Course Number or Course Title header`,
      );
    }
  }

  const sourceRowsByQuarter = emptyQuarterCounts();
  const normalizedRowsByQuarter = emptyQuarterCounts();
  const offeringsByQuarter = emptyQuarterCounts();
  const duplicateTopicRowsCollapsedByQuarter = emptyQuarterCounts();
  const offerings = new Map<string, ParsedPoliticalScienceCourseOffering>();
  const courseIds = new Set<string>();

  for (const section of sections) {
    const term = terms.get(section.caption.quarter);
    if (!term) continue;
    const normalizedHeaders = section.headers.map((header) => header.toLocaleLowerCase());
    const courseColumn = normalizedHeaders.indexOf("course number");
    const titleColumn = normalizedHeaders.indexOf("course title");
    const rows = $(section.table).find("tbody tr").toArray();

    for (const [rowIndex, row] of rows.entries()) {
      const cells = $(row).children("th, td");
      const values = cells.toArray().map((cell) => normalizePoliticalScienceText($(cell).text()));
      if (values.every((value) => value.length === 0)) continue;
      if (
        values.length >= 2 &&
        values[courseColumn]?.toLocaleLowerCase() === "course number" &&
        values[titleColumn]?.toLocaleLowerCase() === "course title"
      ) {
        continue;
      }

      sourceRowsByQuarter[term.quarter] += 1;
      if (
        courseColumn < 0 ||
        titleColumn < 0 ||
        cells.length <= Math.max(courseColumn, titleColumn)
      ) {
        parsingErrors.push(
          `Political Science ${term.quarter} row ${rowIndex + 1} is missing required cells`,
        );
        continue;
      }

      const sourceCourseId = values[courseColumn];
      const courseId = normalizePoliticalScienceCourseId(sourceCourseId);
      if (!courseId) {
        parsingErrors.push(
          `Political Science ${term.quarter} row ${rowIndex + 1} has malformed course identifier '${sourceCourseId}'`,
        );
        continue;
      }
      normalizedRowsByQuarter[term.quarter] += 1;
      courseIds.add(courseId);

      const offering: ParsedPoliticalScienceCourseOffering = {
        academicYear: term.academicYear,
        courseId,
        year: term.year,
        quarter: term.quarter,
        instructors: [],
      };
      const key = offeringKey(offering);
      if (offerings.has(key)) {
        duplicateTopicRowsCollapsedByQuarter[term.quarter] += 1;
      } else {
        offerings.set(key, offering);
        offeringsByQuarter[term.quarter] += 1;
      }
    }
  }

  for (const quarter of INCLUDED_QUARTERS) {
    if (offeringsByQuarter[quarter] === 0) {
      parsingErrors.push(`Political Science listing has no usable ${quarter} offerings`);
    }
  }

  const scheduleText = scheduleRoot ? $(scheduleRoot).text() : "";
  const lastUpdated = parsePoliticalScienceLastUpdated(scheduleText);
  if (/Last updated:/i.test(scheduleText) && !lastUpdated) {
    parsingErrors.push("Could not parse Political Science listing's Last updated value");
  }

  return {
    sourceRowsByQuarter,
    normalizedRowsByQuarter,
    offeringsByQuarter,
    duplicateTopicRowsCollapsedByQuarter,
    scheduleTablesDiscovered: sections.length,
    courseIds: Array.from(courseIds).toSorted(),
    offerings: Array.from(offerings.values()),
    terms: INCLUDED_QUARTERS.flatMap((quarter) => {
      const term = terms.get(quarter);
      return term ? [term] : [];
    }),
    academicYear: academic?.academicYear ?? null,
    lastUpdated,
    parsingErrors,
  };
}

export function selectImportablePoliticalScienceOfferings(
  parsed: ParsedPoliticalScienceCourseOfferingsPage,
  calendarTerms: CalendarTermForImport[],
  now: Date,
): ImportablePoliticalScienceOfferings {
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
  const response = await fetcher(POLITICAL_SCIENCE_COURSE_OFFERINGS_URL, {
    headers: {
      "User-Agent": "Anteater API tentative course offerings scraper",
    },
  });
  if (!response.ok) {
    throw new Error(
      `Failed to fetch ${POLITICAL_SCIENCE_COURSE_OFFERINGS_URL}: HTTP ${response.status}`,
    );
  }
  return await response.text();
}

export async function doScrape(
  db: ReturnType<typeof database>,
  fetcher: typeof fetch = fetch,
  now = new Date(),
): Promise<PoliticalScienceScrapeSummary> {
  const html = await fetchHtml(fetcher);
  const parsed = parsePoliticalScienceCourseOfferings(html);
  if (
    parsed.academicYear === null ||
    parsed.scheduleTablesDiscovered === 0 ||
    parsed.terms.length === 0
  ) {
    throw new Error("Political Science listing did not contain a usable undergraduate schedule");
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
  const importable = selectImportablePoliticalScienceOfferings(parsed, calendarTerms, now);
  const values: Array<typeof tentativeCourseOffering.$inferInsert> = importable.offerings
    .filter(({ courseId }) => knownCourseIds.has(courseId))
    .map((offering) => ({
      source: POLITICAL_SCIENCE_COURSE_OFFERINGS_SOURCE,
      sourceUrl: POLITICAL_SCIENCE_COURSE_OFFERINGS_URL,
      academicYear: offering.academicYear,
      courseId: offering.courseId,
      year: offering.year,
      quarter: offering.quarter,
      instructors: [],
      lastUpdated: parsed.lastUpdated,
    }));

  if (importable.offerings.length > 0 && values.length === 0) {
    throw new Error(
      "Political Science listing did not contain future offerings for any known Anteater API courses",
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
              eq(tentativeCourseOffering.source, POLITICAL_SCIENCE_COURSE_OFFERINGS_SOURCE),
              inArray(tentativeCourseOffering.academicYear, academicYears),
            ),
          )
      : [];
  const relevantExistingRows = existingRows.filter((row) => scopeKeys.has(scopeKey(row)));
  const existingKeys = new Set(
    relevantExistingRows.map((row) =>
      offeringKey({ ...row, instructors: [] } as ParsedPoliticalScienceCourseOffering),
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
          eq(tentativeCourseOffering.source, POLITICAL_SCIENCE_COURSE_OFFERINGS_SOURCE),
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

  const summary: PoliticalScienceScrapeSummary = {
    fallSourceRows: parsed.sourceRowsByQuarter.Fall,
    winterSourceRows: parsed.sourceRowsByQuarter.Winter,
    springSourceRows: parsed.sourceRowsByQuarter.Spring,
    normalizedRows: Object.values(parsed.normalizedRowsByQuarter).reduce(
      (total, count) => total + count,
      0,
    ),
    offeringsByQuarter: parsed.offeringsByQuarter,
    uniqueOfferings: parsed.offerings.length,
    uniqueCourseIds: parsed.courseIds.length,
    duplicateTopicRowsCollapsedByQuarter: parsed.duplicateTopicRowsCollapsedByQuarter,
    displayedSourceUpdateDate: parsed.lastUpdated,
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
