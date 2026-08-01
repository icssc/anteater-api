import type { database } from "@packages/db";
import { and, eq, inArray, ne, notInArray } from "@packages/db/drizzle";
import type { TentativeInstructor, Term } from "@packages/db/schema";
import { calendarTerm, course, instructor, tentativeCourseOffering } from "@packages/db/schema";
import { conflictUpdateSetAllCols } from "@packages/db/utils";
import { load } from "cheerio";

export const PUBLIC_HEALTH_COURSE_OFFERINGS_SOURCE = "PUBLIC_HEALTH_COURSE_OFFERINGS";
export const PUBLIC_HEALTH_COURSE_OFFERINGS_URL =
  "https://publichealth.uci.edu/for-current-students/course-offering/";

const INCLUDED_QUARTERS = ["Fall", "Winter", "Spring"] as const;
const REQUIRED_SECTIONS = ["undergraduate", "graduate"] as const;
const SOURCE_DEPARTMENTS = ["PUBHLTH", "EHS", "EPIDEM"] as const;
type IncludedQuarter = (typeof INCLUDED_QUARTERS)[number];
type PublicHealthSectionLevel = (typeof REQUIRED_SECTIONS)[number];

export type ParsedPublicHealthTerm = {
  header: string;
  academicYear: string;
  year: string;
  quarter: IncludedQuarter;
};

export type ParsedPublicHealthCourseOffering = Omit<ParsedPublicHealthTerm, "header"> & {
  courseId: string;
  instructors: string[];
};

export type ParsedPublicHealthSection = {
  level: PublicHealthSectionLevel;
  heading: string;
  sourceRowsParsed: number;
  normalizedCourseRows: number;
  terms: ParsedPublicHealthTerm[];
};

export type ParsedPublicHealthCourseOfferingsPage = {
  undergraduateSourceRows: number;
  graduateSourceRows: number;
  normalizedCourseRows: number;
  parsedInstructorAssignments: number;
  courseIds: string[];
  offerings: ParsedPublicHealthCourseOffering[];
  sections: ParsedPublicHealthSection[];
  terms: ParsedPublicHealthTerm[];
  academicYear: string;
  lastUpdated: Date | null;
  parsingErrors: string[];
};

export type PublicHealthScrapeSummary = {
  undergraduateSourceRows: number;
  graduateSourceRows: number;
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

type ImportScope = Omit<ParsedPublicHealthTerm, "header">;

type ImportablePublicHealthOfferings = {
  offerings: ParsedPublicHealthCourseOffering[];
  scopes: ImportScope[];
  skippedOrStaleTerms: string[];
};

type SectionColumnIndices = {
  courseId: number;
  title: number;
  terms: Array<ParsedPublicHealthTerm & { columnIndex: number }>;
  instructor: number | null;
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

const offeringKey = (offering: ParsedPublicHealthCourseOffering) =>
  `${scopeKey(offering)}|${offering.courseId}`;

const mergeInstructorNames = (...groups: string[][]): string[] => {
  const names = new Map<string, string>();
  for (const name of groups.flat()) {
    const normalized = normalizeInstructorName(name);
    if (normalized && !names.has(normalized)) names.set(normalized, name);
  }
  return Array.from(names.values());
};

export function normalizePublicHealthCourseId(sourceCourseId: string): string | null {
  const normalized = normalizeWhitespace(sourceCourseId.toUpperCase());
  const departmentPattern = SOURCE_DEPARTMENTS.join("|");
  const match = normalized.match(new RegExp(`^(${departmentPattern})\\s*([A-Z]*\\d+[A-Z]*)$`));
  if (!match) return null;

  const numberMatch = match[2].match(/^([A-Z]*)(\d+)([A-Z]*)$/);
  if (!numberMatch) return null;
  const numeric = Number.parseInt(numberMatch[2], 10);
  if (!Number.isInteger(numeric)) return null;
  return `${match[1]}${numberMatch[1]}${numeric}${numberMatch[3]}`;
}

export function parsePublicHealthInstructorNames(value: string): string[] {
  const candidates = value
    .split(/\s*(?:\/|;|\n)\s*/)
    .map(normalizeWhitespace)
    .filter(Boolean)
    .filter((name) => !/^(?:TBD|TBA)$/i.test(name));
  return mergeInstructorNames(candidates);
}

export function parsePublicHealthAcademicYear(html: string): {
  academicYear: string;
  startYear: number;
} {
  const $ = load(html);
  const text = normalizeWhitespace($.root().text());
  const match = text.match(/\b(20\d{2})\s*[-–—]\s*(20\d{2}|\d{2})\s+Academic year\b/i);
  if (!match) {
    throw new Error("Public Health course offerings page did not contain a valid academic year");
  }

  const startYear = Number.parseInt(match[1], 10);
  const endYearValue = Number.parseInt(match[2], 10);
  const endYear =
    match[2].length === 2 ? Math.floor(startYear / 100) * 100 + endYearValue : endYearValue;
  if (endYear !== startYear + 1) {
    throw new Error(
      `Public Health listing has nonconsecutive academic year ${match[1]}-${match[2]}`,
    );
  }
  return { academicYear: academicYearLabel(startYear), startYear };
}

export function parsePublicHealthLastUpdated(html: string): Date | null {
  const $ = load(html);
  const text = normalizeWhitespace($.root().text());
  const match = text.match(/\blast updated on\s+([A-Za-z]+)\s+(\d{1,2}),\s+(\d{4})\b/i);
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

function termsForAcademicYear(academicYear: string, startYear: number): ParsedPublicHealthTerm[] {
  return INCLUDED_QUARTERS.map((quarter) => ({
    header: `${quarter} quarter`,
    academicYear,
    year: (quarter === "Fall" ? startYear : startYear + 1).toString(10),
    quarter,
  }));
}

function parseSectionHeading(value: string, academicYear: string): PublicHealthSectionLevel | null {
  const heading = normalizeWhitespace(value);
  const match = heading.match(
    /^(Undergraduate|Graduate) Courses for (20\d{2})\s*[-–—]\s*(20\d{2}|\d{2}) Academic Year$/i,
  );
  if (!match) return null;

  const startYear = Number.parseInt(match[2], 10);
  const endYearValue = Number.parseInt(match[3], 10);
  const endYear =
    match[3].length === 2 ? Math.floor(startYear / 100) * 100 + endYearValue : endYearValue;
  if (`${startYear}-${endYear}` !== academicYear) return null;
  return match[1].toLocaleLowerCase() as PublicHealthSectionLevel;
}

function headerKey(value: string): string {
  return normalizeWhitespace(value).toLocaleLowerCase();
}

function parseSectionColumns(
  headers: string[],
  terms: ParsedPublicHealthTerm[],
): SectionColumnIndices | null {
  const normalized = headers.map(headerKey);
  const courseId = normalized.indexOf("course id");
  const title = normalized.findIndex((header) => header === "course title" || header === "title");
  const termColumns = terms.map((term) => ({
    ...term,
    columnIndex: normalized.indexOf(headerKey(term.header)),
  }));
  const instructorIndex = normalized.findIndex(
    (header) => header === "instructor" || header === "instructors",
  );

  if (courseId < 0 || title < 0 || termColumns.some(({ columnIndex }) => columnIndex < 0)) {
    return null;
  }
  return {
    courseId,
    title,
    terms: termColumns,
    instructor: instructorIndex < 0 ? null : instructorIndex,
  };
}

function cellIndicatesOffered(value: string): boolean {
  return /^x$/i.test(normalizeWhitespace(value));
}

function cellIndicatesNotOffered(value: string): boolean {
  return /^(?:|[-–—]|N\/A|No)$/i.test(normalizeWhitespace(value));
}

export function parsePublicHealthCourseOfferings(
  html: string,
): ParsedPublicHealthCourseOfferingsPage {
  const $ = load(html);
  const { academicYear, startYear } = parsePublicHealthAcademicYear(html);
  const terms = termsForAcademicYear(academicYear, startYear);
  const sections: ParsedPublicHealthSection[] = [];
  const offerings = new Map<string, ParsedPublicHealthCourseOffering>();
  const courseIds = new Set<string>();
  const parsingErrors: string[] = [];
  const sourceRowsBySection = new Map<PublicHealthSectionLevel, number>();
  const normalizedRowsBySection = new Map<PublicHealthSectionLevel, number>();
  const offeringsBySectionTerm = new Map<string, number>();

  $(".wp-block-toggle").each((_toggleIndex, toggle) => {
    const heading = normalizeWhitespace($(toggle).find(".toggle__heading").first().text());
    const level = parseSectionHeading(heading, academicYear);
    if (!level) return;

    if (sections.some((section) => section.level === level)) {
      parsingErrors.push(`Public Health listing contains duplicate ${level} sections`);
      return;
    }

    const scheduleTables = $(toggle)
      .find("table")
      .toArray()
      .filter((table) => {
        const headers = $(table)
          .find("thead tr")
          .first()
          .children("th, td")
          .toArray()
          .map((cell) => normalizeWhitespace($(cell).text()));
        return parseSectionColumns(headers, terms) !== null;
      });
    if (scheduleTables.length !== 1) {
      parsingErrors.push(
        `${heading}: expected exactly one structured schedule table, found ${scheduleTables.length}`,
      );
      sections.push({
        level,
        heading,
        sourceRowsParsed: 0,
        normalizedCourseRows: 0,
        terms,
      });
      return;
    }

    const table = scheduleTables[0];
    const headers = $(table)
      .find("thead tr")
      .first()
      .children("th, td")
      .toArray()
      .map((cell) => normalizeWhitespace($(cell).text()));
    const columns = parseSectionColumns(headers, terms);
    if (!columns) return;

    let sourceRowsParsed = 0;
    let normalizedCourseRows = 0;
    $(table)
      .find("tbody tr")
      .each((rowIndex, row) => {
        const cells = $(row).children("td");
        const values = cells.toArray().map((cell) => normalizeWhitespace($(cell).text()));
        if (values.every((value) => !value)) return;
        sourceRowsParsed += 1;

        const requiredIndices = [
          columns.courseId,
          columns.title,
          ...columns.terms.map(({ columnIndex }) => columnIndex),
          ...(columns.instructor === null ? [] : [columns.instructor]),
        ];
        if (cells.length <= Math.max(...requiredIndices)) {
          parsingErrors.push(
            `${heading} row ${rowIndex + 1}: course row is missing required cells`,
          );
          return;
        }

        const courseCell = cells.eq(columns.courseId).clone();
        courseCell.find("sup").remove();
        const sourceCourseId = normalizeWhitespace(courseCell.text());
        const courseId = normalizePublicHealthCourseId(sourceCourseId);
        if (!courseId) {
          parsingErrors.push(
            `${heading} row ${rowIndex + 1}: unrecognized course identifier '${sourceCourseId}'`,
          );
          return;
        }

        normalizedCourseRows += 1;
        courseIds.add(courseId);
        const instructorCell =
          columns.instructor === null ? null : cells.eq(columns.instructor).clone();
        instructorCell?.find("br").replaceWith("\n");
        const instructorNames =
          instructorCell === null ? [] : parsePublicHealthInstructorNames(instructorCell.text());

        for (const term of columns.terms) {
          const availability = normalizeWhitespace(cells.eq(term.columnIndex).text());
          if (!cellIndicatesOffered(availability)) {
            if (!cellIndicatesNotOffered(availability)) {
              parsingErrors.push(
                `${heading} row ${rowIndex + 1}: unrecognized ${term.header} availability '${availability}'`,
              );
            }
            continue;
          }

          const sectionTermKey = `${level}|${termKey(term)}`;
          offeringsBySectionTerm.set(
            sectionTermKey,
            (offeringsBySectionTerm.get(sectionTermKey) ?? 0) + 1,
          );
          const offering: ParsedPublicHealthCourseOffering = {
            academicYear,
            courseId,
            year: term.year,
            quarter: term.quarter,
            instructors: instructorNames,
          };
          const key = offeringKey(offering);
          const existing = offerings.get(key);
          offerings.set(key, {
            ...offering,
            instructors: mergeInstructorNames(existing?.instructors ?? [], instructorNames),
          });
        }
      });

    sourceRowsBySection.set(level, sourceRowsParsed);
    normalizedRowsBySection.set(level, normalizedCourseRows);
    sections.push({
      level,
      heading,
      sourceRowsParsed,
      normalizedCourseRows,
      terms,
    });
  });

  for (const level of REQUIRED_SECTIONS) {
    if (!sections.some((section) => section.level === level)) {
      parsingErrors.push(`Public Health listing is missing its ${level} schedule section`);
    }
    if ((normalizedRowsBySection.get(level) ?? 0) === 0) {
      parsingErrors.push(`Public Health listing has no usable ${level} course rows`);
    }
    for (const term of terms) {
      if ((offeringsBySectionTerm.get(`${level}|${termKey(term)}`) ?? 0) === 0) {
        parsingErrors.push(
          `Public Health ${level} schedule has no offered ${term.quarter} courses`,
        );
      }
    }
  }

  const lastUpdated = parsePublicHealthLastUpdated(html);
  if (/last updated on/i.test($.root().text()) && !lastUpdated) {
    parsingErrors.push("Could not parse the page's last updated value");
  }
  const parsedOfferings = Array.from(offerings.values());

  return {
    undergraduateSourceRows: sourceRowsBySection.get("undergraduate") ?? 0,
    graduateSourceRows: sourceRowsBySection.get("graduate") ?? 0,
    normalizedCourseRows: Array.from(normalizedRowsBySection.values()).reduce(
      (total, count) => total + count,
      0,
    ),
    parsedInstructorAssignments: parsedOfferings.reduce(
      (total, offering) => total + offering.instructors.length,
      0,
    ),
    courseIds: Array.from(courseIds).toSorted(),
    offerings: parsedOfferings,
    sections,
    terms,
    academicYear,
    lastUpdated,
    parsingErrors,
  };
}

function instructorMatchesSource(sourceName: string, knownName: string): boolean {
  const normalizedSource = normalizeInstructorName(sourceName);
  const normalizedKnown = normalizeInstructorName(knownName);
  if (normalizedSource === normalizedKnown) return true;

  const sourceParts = sourceName.split(",").map(normalizeWhitespace);
  if (sourceParts.length === 2 && sourceParts.every(Boolean)) {
    const knownParts = normalizedKnown.split(" ");
    return (
      knownParts[0] === normalizeInstructorName(sourceParts[1]) &&
      knownParts.at(-1) === normalizeInstructorName(sourceParts[0])
    );
  }
  if (!normalizedSource.includes(" ")) {
    return normalizedKnown.split(" ").at(-1) === normalizedSource;
  }
  return false;
}

export function resolvePublicHealthInstructors(
  parsed: string[],
  knownInstructors: KnownInstructor[],
): TentativeInstructor[] {
  const resolved: TentativeInstructor[] = [];
  for (const sourceName of mergeInstructorNames(parsed)) {
    const candidates = knownInstructors.filter(({ name }) =>
      instructorMatchesSource(sourceName, name),
    );
    const sourceDepartmentCandidates = candidates.filter(({ department }) =>
      /public health|epidemiology|environmental health|population/i.test(department),
    );
    const narrowed =
      sourceDepartmentCandidates.length > 0 ? sourceDepartmentCandidates : candidates;
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

export function selectImportablePublicHealthOfferings(
  parsed: ParsedPublicHealthCourseOfferingsPage,
  calendarTerms: CalendarTermForImport[],
  now: Date,
): ImportablePublicHealthOfferings {
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
  const response = await fetcher(PUBLIC_HEALTH_COURSE_OFFERINGS_URL, {
    headers: {
      "User-Agent": "Anteater API tentative course offerings scraper",
    },
  });
  if (!response.ok) {
    throw new Error(
      `Failed to fetch ${PUBLIC_HEALTH_COURSE_OFFERINGS_URL}: HTTP ${response.status}`,
    );
  }
  return await response.text();
}

export async function doScrape(
  db: ReturnType<typeof database>,
  fetcher: typeof fetch = fetch,
  now = new Date(),
): Promise<PublicHealthScrapeSummary> {
  const html = await fetchHtml(fetcher);
  const parsed = parsePublicHealthCourseOfferings(html);
  if (parsed.undergraduateSourceRows === 0 || parsed.graduateSourceRows === 0) {
    throw new Error("Public Health listing did not contain both required schedule sections");
  }

  const parsedInstructorNames = Array.from(
    new Set(parsed.offerings.flatMap(({ instructors }) => instructors)),
  ).toSorted();
  const sourceYears = Array.from(new Set(parsed.terms.map(({ year }) => year)));
  const [knownCourses, knownInstructors, calendarTerms] = await Promise.all([
    db.select({ id: course.id }).from(course).where(inArray(course.id, parsed.courseIds)),
    parsedInstructorNames.length > 0
      ? db
          .select({
            ucinetid: instructor.ucinetid,
            name: instructor.name,
            department: instructor.department,
          })
          .from(instructor)
          .where(ne(instructor.ucinetid, "student"))
      : Promise.resolve([]),
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
  const unresolvedInstructorNames = parsedInstructorNames.filter(
    (name) => resolvePublicHealthInstructors([name], knownInstructors).length === 0,
  );
  for (const name of unresolvedInstructorNames) {
    console.warn(
      `Could not safely resolve Public Health instructor '${name}'; omitting assignment`,
    );
  }

  const importable = selectImportablePublicHealthOfferings(parsed, calendarTerms, now);
  const values: Array<typeof tentativeCourseOffering.$inferInsert> = importable.offerings
    .filter(({ courseId }) => knownCourseIds.has(courseId))
    .map((offering) => ({
      source: PUBLIC_HEALTH_COURSE_OFFERINGS_SOURCE,
      sourceUrl: PUBLIC_HEALTH_COURSE_OFFERINGS_URL,
      academicYear: offering.academicYear,
      courseId: offering.courseId,
      year: offering.year,
      quarter: offering.quarter,
      instructors: resolvePublicHealthInstructors(offering.instructors, knownInstructors),
      lastUpdated: parsed.lastUpdated,
    }));

  if (importable.offerings.length > 0 && values.length === 0) {
    throw new Error(
      "Public Health listing did not contain future offerings for any known Anteater API courses",
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
              eq(tentativeCourseOffering.source, PUBLIC_HEALTH_COURSE_OFFERINGS_SOURCE),
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
      } as ParsedPublicHealthCourseOffering),
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
  // Scoped deletion is deactivation for this table. A partial undergraduate or graduate snapshot
  // may upsert recovered rows, but any parsing error disables cleanup of prior source data.
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
          eq(tentativeCourseOffering.source, PUBLIC_HEALTH_COURSE_OFFERINGS_SOURCE),
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

  const summary: PublicHealthScrapeSummary = {
    undergraduateSourceRows: parsed.undergraduateSourceRows,
    graduateSourceRows: parsed.graduateSourceRows,
    normalizedCourseRows: parsed.normalizedCourseRows,
    uniqueOfferings: parsed.offerings.length,
    uniqueCourseIds: parsed.courseIds.length,
    parsedInstructorAssignments: parsed.parsedInstructorAssignments,
    resolvedInstructorAssignments: parsed.offerings.reduce(
      (total, offering) =>
        total + resolvePublicHealthInstructors(offering.instructors, knownInstructors).length,
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
