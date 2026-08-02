import type { database } from "@packages/db";
import { and, eq, inArray, notInArray } from "@packages/db/drizzle";
import type { Term } from "@packages/db/schema";
import { calendarTerm, course, tentativeCourseOffering } from "@packages/db/schema";
import { conflictUpdateSetAllCols } from "@packages/db/utils";
import { load } from "cheerio";

export const PHYSICS_COURSE_OFFERINGS_SOURCE = "PHYSICS_COURSE_OFFERINGS";
export const PHYSICS_COURSE_OFFERINGS_URL =
  "https://www.physics.uci.edu/undergrad-program/course-info";

const INCLUDED_QUARTERS = ["Fall", "Winter", "Spring"] as const;
type IncludedQuarter = (typeof INCLUDED_QUARTERS)[number];

const EXPECTED_MARKERS: Record<IncludedQuarter, string> = {
  Fall: "F",
  Winter: "W",
  Spring: "S",
};

export type ParsedPhysicsTerm = {
  header: string;
  academicYear: string;
  year: string;
  quarter: IncludedQuarter;
};

export type ParsedPhysicsCourseOffering = Omit<ParsedPhysicsTerm, "header"> & {
  courseId: string;
  instructors: [];
};

export type ParsedPhysicsCourseOfferingsPage = {
  sourceTableRows: number;
  normalizedCourseRows: number;
  offeringsByQuarter: Record<IncludedQuarter, number>;
  duplicateRowsCollapsed: number;
  courseIds: string[];
  offerings: ParsedPhysicsCourseOffering[];
  terms: ParsedPhysicsTerm[];
  academicYear: string;
  lastUpdated: null;
  parsingErrors: string[];
};

export type PhysicsScrapeSummary = {
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

type ImportScope = Omit<ParsedPhysicsTerm, "header">;

type ImportablePhysicsOfferings = {
  offerings: ParsedPhysicsCourseOffering[];
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

const offeringKey = (offering: ParsedPhysicsCourseOffering) =>
  `${scopeKey(offering)}|${offering.courseId}`;

function emptyOfferingCounts(): Record<IncludedQuarter, number> {
  return { Fall: 0, Winter: 0, Spring: 0 };
}

export function normalizePhysicsCourseId(sourceCourseId: string): string | null {
  const normalized = normalizeWhitespace(sourceCourseId.toUpperCase()).replaceAll(" ", "");
  const prefixedMatch = normalized.match(/^P(\d+[A-Z]*)$/);
  const honorsMatch = normalized.match(/^(H\d+[A-Z]*)$/);
  const courseNumber = prefixedMatch?.[1] ?? honorsMatch?.[1];
  if (!courseNumber) return null;

  const numberMatch = courseNumber.match(/^([A-Z]*)(\d+)([A-Z]*)$/);
  if (!numberMatch) return null;
  const numeric = Number.parseInt(numberMatch[2], 10);
  if (!Number.isInteger(numeric)) return null;
  return `PHYSICS${numberMatch[1]}${numeric}${numberMatch[3]}`;
}

export function parsePhysicsAcademicYear(html: string): {
  academicYear: string;
  startYear: number;
} {
  const $ = load(html);
  const headings = $("h1, h2, h3, h4, h5, h6")
    .toArray()
    .map((heading) => normalizeWhitespace($(heading).text()));
  const heading = headings.find((value) => /Tentative Course Offerings/i.test(value));
  const match = heading?.match(
    /^(20\d{2})\s*[-–—]\s*(20\d{2}|\d{2})\s+Tentative Course Offerings$/i,
  );
  if (!match) {
    throw new Error("Physics course offerings page did not contain a valid academic year");
  }

  const startYear = Number.parseInt(match[1], 10);
  const endYearValue = Number.parseInt(match[2], 10);
  const endYear =
    match[2].length === 2 ? Math.floor(startYear / 100) * 100 + endYearValue : endYearValue;
  if (endYear !== startYear + 1) {
    throw new Error(`Physics listing has nonconsecutive academic year ${match[1]}-${match[2]}`);
  }
  return { academicYear: academicYearLabel(startYear), startYear };
}

export function parsePhysicsTermHeader(
  value: string,
  academicYear: string,
): ParsedPhysicsTerm | null {
  const header = normalizeWhitespace(value);
  const match = header.match(/^(Fall|Winter|Spring)\s+(20\d{2})$/i);
  if (!match) return null;
  const quarter = `${match[1][0].toUpperCase()}${match[1]
    .slice(1)
    .toLocaleLowerCase()}` as IncludedQuarter;
  return { header, academicYear, year: match[2], quarter };
}

export function parsePhysicsCourseOfferings(html: string): ParsedPhysicsCourseOfferingsPage {
  const $ = load(html);
  const { academicYear, startYear } = parsePhysicsAcademicYear(html);
  const offerings = new Map<string, ParsedPhysicsCourseOffering>();
  const courseIds = new Set<string>();
  const offeringsByQuarter = emptyOfferingCounts();
  const parsingErrors: string[] = [];
  let sourceTableRows = 0;
  let normalizedCourseRows = 0;
  let duplicateRowsCollapsed = 0;

  const scheduleTables = $("table")
    .toArray()
    .filter((table) => {
      const headers = $(table)
        .find("thead tr")
        .first()
        .children("th, td")
        .toArray()
        .map((cell) => normalizeWhitespace($(cell).text()).toLocaleLowerCase());
      return headers.includes("course #") && headers.includes("course name");
    });
  if (scheduleTables.length === 0) {
    parsingErrors.push("Physics listing is missing its tentative-offerings table");
  } else if (scheduleTables.length > 1) {
    parsingErrors.push(`Physics listing has ${scheduleTables.length} tentative-offerings tables`);
  }

  const scheduleTable = scheduleTables.length === 1 ? scheduleTables[0] : null;
  const headers = scheduleTable
    ? $(scheduleTable)
        .find("thead tr")
        .first()
        .children("th, td")
        .toArray()
        .map((cell) => normalizeWhitespace($(cell).text()))
    : [];
  const normalizedHeaders = headers.map((header) => header.toLocaleLowerCase());
  const courseColumn = normalizedHeaders.indexOf("course #");
  const titleColumn = normalizedHeaders.indexOf("course name");
  const termsByQuarter = new Map<IncludedQuarter, ParsedPhysicsTerm & { columnIndex: number }>();

  for (const [columnIndex, header] of headers.entries()) {
    const term = parsePhysicsTermHeader(header, academicYear);
    if (!term) continue;
    if (termsByQuarter.has(term.quarter)) {
      parsingErrors.push(`Physics listing has duplicate ${term.quarter} columns`);
      continue;
    }
    termsByQuarter.set(term.quarter, { ...term, columnIndex });
  }

  for (const quarter of INCLUDED_QUARTERS) {
    const term = termsByQuarter.get(quarter);
    if (!term) {
      parsingErrors.push(`Physics listing is missing its required ${quarter} column`);
      continue;
    }
    const expectedYear = quarter === "Fall" ? startYear : startYear + 1;
    if (term.year !== expectedYear.toString(10)) {
      parsingErrors.push(
        `Physics ${term.header} column does not belong to academic year ${academicYear}`,
      );
    }
  }

  if (scheduleTable) {
    const rows = $(scheduleTable).find("tbody tr").toArray();
    for (const [rowIndex, row] of rows.entries()) {
      const cells = $(row).children("th, td");
      const values = cells.toArray().map((cell) => normalizeWhitespace($(cell).text()));
      if (values.every((value) => value.length === 0)) continue;
      sourceTableRows += 1;

      const requiredIndices = [
        courseColumn,
        titleColumn,
        ...Array.from(termsByQuarter.values()).map(({ columnIndex }) => columnIndex),
      ];
      if (courseColumn < 0 || titleColumn < 0 || cells.length <= Math.max(...requiredIndices)) {
        parsingErrors.push(`Physics row ${rowIndex + 1} is missing required cells`);
        continue;
      }

      const sourceCourseId = values[courseColumn];
      const courseId = normalizePhysicsCourseId(sourceCourseId);
      if (!courseId) {
        parsingErrors.push(
          `Physics row ${rowIndex + 1} has malformed course identifier '${sourceCourseId}'`,
        );
        continue;
      }
      normalizedCourseRows += 1;
      courseIds.add(courseId);

      for (const quarter of INCLUDED_QUARTERS) {
        const term = termsByQuarter.get(quarter);
        if (!term) continue;
        const marker = values[term.columnIndex];
        if (marker.length === 0) continue;
        if (marker !== EXPECTED_MARKERS[quarter]) {
          parsingErrors.push(
            `Physics row ${rowIndex + 1} ${quarter} cell has unexpected marker '${marker}'`,
          );
          continue;
        }

        const offering: ParsedPhysicsCourseOffering = {
          academicYear,
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
    if (termsByQuarter.has(quarter) && offeringsByQuarter[quarter] === 0) {
      parsingErrors.push(`Physics listing has no usable ${quarter} offerings`);
    }
  }

  return {
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
    academicYear,
    lastUpdated: null,
    parsingErrors,
  };
}

export function selectImportablePhysicsOfferings(
  parsed: ParsedPhysicsCourseOfferingsPage,
  calendarTerms: CalendarTermForImport[],
  now: Date,
): ImportablePhysicsOfferings {
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
  const response = await fetcher(PHYSICS_COURSE_OFFERINGS_URL, {
    headers: {
      "User-Agent": "Anteater API tentative course offerings scraper",
    },
  });
  if (!response.ok) {
    throw new Error(`Failed to fetch ${PHYSICS_COURSE_OFFERINGS_URL}: HTTP ${response.status}`);
  }
  return await response.text();
}

export async function doScrape(
  db: ReturnType<typeof database>,
  fetcher: typeof fetch = fetch,
  now = new Date(),
): Promise<PhysicsScrapeSummary> {
  const html = await fetchHtml(fetcher);
  const parsed = parsePhysicsCourseOfferings(html);
  if (parsed.sourceTableRows === 0 || parsed.terms.length === 0) {
    throw new Error("Physics listing did not contain a usable tentative-offerings table");
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
  const importable = selectImportablePhysicsOfferings(parsed, calendarTerms, now);
  const values: Array<typeof tentativeCourseOffering.$inferInsert> = importable.offerings
    .filter(({ courseId }) => knownCourseIds.has(courseId))
    .map((offering) => ({
      source: PHYSICS_COURSE_OFFERINGS_SOURCE,
      sourceUrl: PHYSICS_COURSE_OFFERINGS_URL,
      academicYear: offering.academicYear,
      courseId: offering.courseId,
      year: offering.year,
      quarter: offering.quarter,
      instructors: [],
      lastUpdated: null,
    }));

  if (importable.offerings.length > 0 && values.length === 0) {
    throw new Error(
      "Physics listing did not contain future offerings for any known Anteater API courses",
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
              eq(tentativeCourseOffering.source, PHYSICS_COURSE_OFFERINGS_SOURCE),
              inArray(tentativeCourseOffering.academicYear, academicYears),
            ),
          )
      : [];
  const relevantExistingRows = existingRows.filter((row) => scopeKeys.has(scopeKey(row)));
  const existingKeys = new Set(
    relevantExistingRows.map((row) =>
      offeringKey({ ...row, instructors: [] } as ParsedPhysicsCourseOffering),
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
          eq(tentativeCourseOffering.source, PHYSICS_COURSE_OFFERINGS_SOURCE),
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

  const summary: PhysicsScrapeSummary = {
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
