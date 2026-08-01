import type { database } from "@packages/db";
import { and, eq, inArray, ne, notInArray } from "@packages/db/drizzle";
import type { TentativeInstructor, Term } from "@packages/db/schema";
import { calendarTerm, course, instructor, tentativeCourseOffering } from "@packages/db/schema";
import { conflictUpdateSetAllCols } from "@packages/db/utils";
import { load } from "cheerio";

export const EARTH_SYSTEM_SCIENCE_COURSE_OFFERINGS_SOURCE = "EARTH_SYSTEM_SCIENCE_COURSE_OFFERINGS";
export const EARTH_SYSTEM_SCIENCE_COURSE_OFFERINGS_URL =
  "https://www.ess.uci.edu/undergrad/coursesoffered";

const INCLUDED_QUARTERS = ["Fall", "Winter", "Spring"] as const;
type IncludedQuarter = (typeof INCLUDED_QUARTERS)[number];

export type ParsedEarthSystemScienceTerm = {
  header: string;
  academicYear: string;
  year: string;
  quarter: IncludedQuarter;
};

export type ParsedEarthSystemScienceCourseOffering = Omit<
  ParsedEarthSystemScienceTerm,
  "header"
> & {
  courseId: string;
  instructors: string[];
};

export type ParsedEarthSystemScienceCourseOfferingsPage = {
  sourceRowsParsed: number;
  normalizedCourseRows: number;
  parsedInstructorAssignments: number;
  courseIds: string[];
  offerings: ParsedEarthSystemScienceCourseOffering[];
  terms: ParsedEarthSystemScienceTerm[];
  academicYear: string;
  lastUpdated: Date | null;
  parsingErrors: string[];
};

export type EarthSystemScienceScrapeSummary = {
  sourceRowsParsed: number;
  normalizedCourseRows: number;
  uniqueOfferings: number;
  uniqueCourseIds: number;
  parsedInstructorAssignments: number;
  resolvedInstructorAssignments: number;
  unresolvedInstructorNames: string[];
  matchedCourseIds: string[];
  unmatchedCourseIds: string[];
  rowsInserted: number;
  rowsUpdated: number;
  rowsDeactivated: number;
  skippedOrStaleTerms: string[];
  parsingErrors: string[];
};

export type KnownInstructor = {
  ucinetid: string;
  name: string;
  department: string;
};

type CalendarTermForImport = {
  year: string;
  quarter: Term;
  instructionStart: Date;
};

type ImportScope = Omit<ParsedEarthSystemScienceTerm, "header">;

type ImportableEarthSystemScienceOfferings = {
  offerings: ParsedEarthSystemScienceCourseOffering[];
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

const normalizeInstructorName = (value: string) =>
  normalizeWhitespace(value).toLocaleLowerCase().replaceAll(/[.,]/g, "");

const academicYearLabel = (startYear: number) => `${startYear}-${startYear + 1}`;

const termKey = (term: { year: string; quarter: string }) => `${term.year} ${term.quarter}`;

const scopeKey = (term: { academicYear: string; year: string; quarter: string }) =>
  `${term.academicYear}|${termKey(term)}`;

const offeringKey = (offering: ParsedEarthSystemScienceCourseOffering) =>
  `${scopeKey(offering)}|${offering.courseId}`;

const mergeInstructorNames = (...groups: string[][]): string[] => {
  const names = new Map<string, string>();
  for (const name of groups.flat()) {
    const normalized = normalizeInstructorName(name);
    if (normalized && !names.has(normalized)) names.set(normalized, name);
  }
  return Array.from(names.values());
};

export function normalizeEarthSystemScienceCourseId(sourceCourseId: string): string | null {
  const normalized = normalizeWhitespace(sourceCourseId.toUpperCase());
  const match = normalized.match(/^EARTHSS\s*([A-Z]*\d+[A-Z]*)$/);
  if (!match) return null;

  const courseNumber = match[1];
  const numberMatch = courseNumber.match(/^([A-Z]*)(\d+)([A-Z]*)$/);
  if (!numberMatch) return null;
  const numeric = Number.parseInt(numberMatch[2], 10);
  if (!Number.isInteger(numeric)) return null;
  return `EARTHSS${numberMatch[1]}${numeric}${numberMatch[3]}`;
}

export function parseEarthSystemScienceInstructorNames(value: string): string[] {
  const candidates = value
    .split(/\s*(?:\/|;|\n)\s*/)
    .map(normalizeWhitespace)
    .filter(Boolean)
    .filter((name) => !/^TBD$/i.test(name));
  return mergeInstructorNames(candidates);
}

export function parseEarthSystemScienceAcademicYear(html: string): {
  academicYear: string;
  startYear: number;
} {
  const $ = load(html);
  const heading = normalizeWhitespace($("h1").first().text() || $("title").first().text());
  const match = heading.match(/\b(20\d{2})\s*[-–—]\s*(20\d{2}|\d{2})\s+Courses Offered\b/i);
  if (!match) {
    throw new Error(
      "Earth System Science course offerings page did not contain a valid academic year",
    );
  }

  const startYear = Number.parseInt(match[1], 10);
  const endYearValue = Number.parseInt(match[2], 10);
  const endYear =
    match[2].length === 2 ? Math.floor(startYear / 100) * 100 + endYearValue : endYearValue;
  if (endYear !== startYear + 1) {
    throw new Error(
      `Earth System Science listing has nonconsecutive academic year ${match[1]}-${match[2]}`,
    );
  }
  return { academicYear: academicYearLabel(startYear), startYear };
}

export function parseEarthSystemScienceTermHeader(
  value: string,
  academicYear: string,
): ParsedEarthSystemScienceTerm | null {
  const header = normalizeWhitespace(value);
  const match = header.match(/^(Fall|Winter|Spring)\s+(20\d{2})$/i);
  if (!match) return null;

  const quarter = `${match[1][0].toUpperCase()}${match[1]
    .slice(1)
    .toLocaleLowerCase()}` as IncludedQuarter;
  return { header, academicYear, year: match[2], quarter };
}

function parseLastUpdated(html: string): Date | null {
  const $ = load(html);
  const text = normalizeWhitespace($.root().text());
  const match = text.match(/\bLast updated:?\s+([A-Za-z]+)\s+(\d{1,2}),\s+(\d{4})\b/i);
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

export function parseEarthSystemScienceCourseOfferings(
  html: string,
): ParsedEarthSystemScienceCourseOfferingsPage {
  const $ = load(html);
  const { academicYear, startYear } = parseEarthSystemScienceAcademicYear(html);
  const offerings = new Map<string, ParsedEarthSystemScienceCourseOffering>();
  const courseIds = new Set<string>();
  const terms: ParsedEarthSystemScienceTerm[] = [];
  const normalizedRowsByQuarter = new Map<IncludedQuarter, number>();
  const parsingErrors: string[] = [];
  let sourceRowsParsed = 0;
  let normalizedCourseRows = 0;
  let sourceTableCount = 0;

  $("table").each((tableIndex, table) => {
    const headers = $(table)
      .find("thead tr")
      .first()
      .children("th, td")
      .toArray()
      .map((cell) => normalizeWhitespace($(cell).text()));
    if (headers.length === 0) return;

    const normalizedHeaders = headers.map((header) => header.toLocaleLowerCase());
    if (!normalizedHeaders.includes("course name") || !normalizedHeaders.includes("instructor")) {
      return;
    }
    sourceTableCount += 1;

    const term = parseEarthSystemScienceTermHeader(headers[0] ?? "", academicYear);
    if (!term) {
      parsingErrors.push(
        `Earth System Science table ${tableIndex + 1}: unrecognized term heading '${headers[0] ?? ""}'`,
      );
      return;
    }
    const expectedYear = term.quarter === "Fall" ? startYear : startYear + 1;
    if (Number.parseInt(term.year, 10) !== expectedYear) {
      parsingErrors.push(
        `${term.header}: expected ${term.quarter} ${expectedYear} for ${academicYear}`,
      );
    }
    if (terms.some(({ quarter }) => quarter === term.quarter)) {
      parsingErrors.push(`Earth System Science listing contains duplicate ${term.quarter} tables`);
    }
    terms.push(term);

    $(table)
      .find("tbody tr")
      .each((rowIndex, row) => {
        const cells = $(row).children("td");
        const values = cells.toArray().map((cell) => normalizeWhitespace($(cell).text()));
        if (values.every((value) => !value)) return;
        sourceRowsParsed += 1;

        if (cells.length < 3) {
          parsingErrors.push(
            `${term.header} row ${rowIndex + 1}: course row is missing required cells`,
          );
          return;
        }

        const sourceCourseId = values[0] ?? "";
        const courseId = normalizeEarthSystemScienceCourseId(sourceCourseId);
        if (!courseId) {
          parsingErrors.push(
            `${term.header} row ${rowIndex + 1}: unrecognized course identifier '${sourceCourseId}'`,
          );
          return;
        }

        normalizedCourseRows += 1;
        normalizedRowsByQuarter.set(
          term.quarter,
          (normalizedRowsByQuarter.get(term.quarter) ?? 0) + 1,
        );
        courseIds.add(courseId);
        const instructorCell = cells.eq(2).clone();
        instructorCell.find("br").replaceWith("\n");
        const parsedInstructors = parseEarthSystemScienceInstructorNames(instructorCell.text());
        const key = offeringKey({
          academicYear,
          courseId,
          year: term.year,
          quarter: term.quarter,
          instructors: [],
        });
        const existing = offerings.get(key);
        offerings.set(key, {
          academicYear,
          courseId,
          year: term.year,
          quarter: term.quarter,
          instructors: mergeInstructorNames(existing?.instructors ?? [], parsedInstructors),
        });
      });
  });

  if (sourceTableCount === 0) {
    throw new Error("Earth System Science listing did not contain any course-offerings tables");
  }
  for (const quarter of INCLUDED_QUARTERS) {
    if (!terms.some((term) => term.quarter === quarter)) {
      parsingErrors.push(`Earth System Science listing is missing its ${quarter} table`);
    }
    if ((normalizedRowsByQuarter.get(quarter) ?? 0) === 0) {
      parsingErrors.push(`Earth System Science listing has no usable ${quarter} course rows`);
    }
  }

  const lastUpdated = parseLastUpdated(html);
  if (/Last updated:?/i.test($.root().text()) && !lastUpdated) {
    parsingErrors.push("Could not parse the page's Last updated value");
  }
  const parsedOfferings = Array.from(offerings.values());

  return {
    sourceRowsParsed,
    normalizedCourseRows,
    parsedInstructorAssignments: parsedOfferings.reduce(
      (total, offering) => total + offering.instructors.length,
      0,
    ),
    courseIds: Array.from(courseIds).toSorted(),
    offerings: parsedOfferings,
    terms,
    academicYear,
    lastUpdated,
    parsingErrors,
  };
}

function splitSourceInstructorName(sourceName: string): {
  firstName: string;
  lastName: string;
} | null {
  const parts = sourceName.split(",").map(normalizeWhitespace);
  if (parts.length !== 2 || parts.some((part) => !part)) return null;
  return { lastName: parts[0], firstName: parts[1] };
}

function instructorMatchesSource(sourceName: string, knownName: string): boolean {
  const normalizedSource = normalizeInstructorName(sourceName);
  const normalizedKnown = normalizeInstructorName(knownName);
  if (normalizedKnown === normalizedSource) return true;

  const source = splitSourceInstructorName(sourceName);
  if (!source) return false;
  const knownParts = normalizedKnown.split(" ");
  return (
    knownParts[0] === normalizeInstructorName(source.firstName) &&
    knownParts.at(-1) === normalizeInstructorName(source.lastName)
  );
}

export function resolveEarthSystemScienceInstructors(
  parsed: string[],
  knownInstructors: KnownInstructor[],
): TentativeInstructor[] {
  const resolved: TentativeInstructor[] = [];
  for (const sourceName of mergeInstructorNames(parsed)) {
    const candidates = knownInstructors.filter(({ name }) =>
      instructorMatchesSource(sourceName, name),
    );
    const departmentCandidates = candidates.filter(({ department }) =>
      /earth system science/i.test(department),
    );
    const narrowed = departmentCandidates.length > 0 ? departmentCandidates : candidates;
    if (narrowed.length !== 1) continue;

    const [match] = narrowed;
    resolved.push({
      status: "assigned",
      name: sourceName,
      ucinetid: match.ucinetid,
    });
  }

  return resolved.filter(
    (value, index, all) =>
      all.findIndex(
        (candidate) =>
          candidate.status === value.status &&
          candidate.name === value.name &&
          candidate.ucinetid === value.ucinetid,
      ) === index,
  );
}

export function selectImportableEarthSystemScienceOfferings(
  parsed: ParsedEarthSystemScienceCourseOfferingsPage,
  calendarTerms: CalendarTermForImport[],
  now: Date,
): ImportableEarthSystemScienceOfferings {
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
  const response = await fetcher(EARTH_SYSTEM_SCIENCE_COURSE_OFFERINGS_URL, {
    headers: {
      "User-Agent": "Anteater API tentative course offerings scraper",
    },
  });
  if (!response.ok) {
    throw new Error(
      `Failed to fetch ${EARTH_SYSTEM_SCIENCE_COURSE_OFFERINGS_URL}: HTTP ${response.status}`,
    );
  }
  return await response.text();
}

export async function doScrape(
  db: ReturnType<typeof database>,
  fetcher: typeof fetch = fetch,
  now = new Date(),
): Promise<EarthSystemScienceScrapeSummary> {
  const html = await fetchHtml(fetcher);
  const parsed = parseEarthSystemScienceCourseOfferings(html);
  if (parsed.sourceRowsParsed === 0 || parsed.normalizedCourseRows === 0) {
    throw new Error("Earth System Science listing did not contain any usable course rows");
  }

  const sourceYears = Array.from(new Set(parsed.terms.map(({ year }) => year)));
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
      .where(inArray(calendarTerm.year, sourceYears)),
  ]);
  const knownCourseIds = new Set(knownCourses.map(({ id }) => id));
  const matchedCourseIds = parsed.courseIds.filter((id) => knownCourseIds.has(id));
  const unmatchedCourseIds = parsed.courseIds.filter((id) => !knownCourseIds.has(id));
  const parsedInstructorNames = Array.from(
    new Set(parsed.offerings.flatMap(({ instructors }) => instructors)),
  ).toSorted();
  const unresolvedInstructorNames = parsedInstructorNames.filter(
    (name) => resolveEarthSystemScienceInstructors([name], knownInstructors).length === 0,
  );
  for (const name of unresolvedInstructorNames) {
    console.warn(
      `Could not safely resolve Earth System Science instructor '${name}'; omitting assignment`,
    );
  }

  const importable = selectImportableEarthSystemScienceOfferings(parsed, calendarTerms, now);
  const values: Array<typeof tentativeCourseOffering.$inferInsert> = importable.offerings
    .filter(({ courseId }) => knownCourseIds.has(courseId))
    .map((offering) => ({
      source: EARTH_SYSTEM_SCIENCE_COURSE_OFFERINGS_SOURCE,
      sourceUrl: EARTH_SYSTEM_SCIENCE_COURSE_OFFERINGS_URL,
      academicYear: offering.academicYear,
      courseId: offering.courseId,
      year: offering.year,
      quarter: offering.quarter,
      instructors: resolveEarthSystemScienceInstructors(offering.instructors, knownInstructors),
      lastUpdated: parsed.lastUpdated,
    }));

  if (importable.offerings.length > 0 && values.length === 0) {
    throw new Error(
      "Earth System Science listing did not contain future offerings for any known Anteater API courses",
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
              eq(tentativeCourseOffering.source, EARTH_SYSTEM_SCIENCE_COURSE_OFFERINGS_SOURCE),
              inArray(tentativeCourseOffering.academicYear, academicYears),
            ),
          )
      : [];
  const relevantExistingRows = existingRows.filter((row) => scopeKeys.has(scopeKey(row)));
  const existingKeys = new Set(
    relevantExistingRows.map((row) =>
      offeringKey({
        ...row,
        instructors: [],
      } as ParsedEarthSystemScienceCourseOffering),
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
  // This table uses scoped deletion as deactivation. Partial snapshots may upsert recovered rows,
  // but any parsing error disables cleanup of prior source data.
  const cleanupEnabled = parsed.parsingErrors.length === 0;
  const rowsDeactivated = cleanupEnabled
    ? Array.from(existingKeys).filter((key) => !sourceCurrentKeys.has(key)).length
    : 0;

  if (importable.scopes.length > 0) {
    await db.transaction(async (tx) => {
      for (const scope of importable.scopes) {
        // Retaining all source IDs here protects previously imported rows when the local catalogue
        // temporarily lacks a course that remains present on the official source page.
        const sourceCourseIds = Array.from(
          new Set(
            importable.offerings
              .filter((offering) => scopeKey(offering) === scopeKey(scope))
              .map(({ courseId }) => courseId),
          ),
        );
        const scopeConditions = and(
          eq(tentativeCourseOffering.source, EARTH_SYSTEM_SCIENCE_COURSE_OFFERINGS_SOURCE),
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

  const summary: EarthSystemScienceScrapeSummary = {
    sourceRowsParsed: parsed.sourceRowsParsed,
    normalizedCourseRows: parsed.normalizedCourseRows,
    uniqueOfferings: parsed.offerings.length,
    uniqueCourseIds: parsed.courseIds.length,
    parsedInstructorAssignments: parsed.parsedInstructorAssignments,
    resolvedInstructorAssignments: parsed.offerings.reduce(
      (total, offering) =>
        total + resolveEarthSystemScienceInstructors(offering.instructors, knownInstructors).length,
      0,
    ),
    unresolvedInstructorNames,
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
