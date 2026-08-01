import type { database } from "@packages/db";
import { and, eq, inArray, ne, notInArray } from "@packages/db/drizzle";
import type { TentativeInstructor, Term } from "@packages/db/schema";
import { calendarTerm, course, instructor, tentativeCourseOffering } from "@packages/db/schema";
import { conflictUpdateSetAllCols } from "@packages/db/utils";
import { load } from "cheerio";

export const CHEMISTRY_GRADUATE_COURSE_OFFERINGS_SOURCE = "CHEMISTRY_GRADUATE_COURSE_OFFERINGS";
export const CHEMISTRY_GRADUATE_COURSE_OFFERINGS_URL = "https://www.chem.uci.edu/graduate/courses";

const INCLUDED_QUARTERS = ["Fall", "Winter", "Spring"] as const;
const NON_PERSON_PLACEHOLDERS = new Set(["physics", "pharmsci"]);
type IncludedQuarter = (typeof INCLUDED_QUARTERS)[number];

export type ParsedGraduateChemistryTerm = {
  header: string;
  academicYear: string;
  year: string;
  quarter: IncludedQuarter;
};

export type ParsedGraduateChemistryCourseOffering = Omit<ParsedGraduateChemistryTerm, "header"> & {
  courseId: string;
  instructors: string[];
};

export type ParsedGraduateChemistryCourseOfferingsPage = {
  sourceRowsParsed: number;
  normalizedCourseRows: number;
  instructorNamesParsed: number;
  ignoredNonPersonPlaceholders: string[];
  courseIds: string[];
  offerings: ParsedGraduateChemistryCourseOffering[];
  terms: ParsedGraduateChemistryTerm[];
  academicYear: string;
  lastUpdated: null;
  parsingErrors: string[];
};

export type GraduateChemistryScrapeSummary = {
  sourceRowsParsed: number;
  normalizedCourseRows: number;
  uniqueOfferings: number;
  resolvedInstructorAssignments: number;
  unresolvedInstructorNames: string[];
  ignoredNonPersonPlaceholders: string[];
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

type ParsedInstructorCell = {
  instructors: string[];
  ignoredNonPersonPlaceholders: string[];
};

type CalendarTermForImport = {
  year: string;
  quarter: Term;
  instructionStart: Date;
};

type ImportScope = Omit<ParsedGraduateChemistryTerm, "header">;

type ImportableGraduateChemistryOfferings = {
  offerings: ParsedGraduateChemistryCourseOffering[];
  scopes: ImportScope[];
  skippedOrStaleTerms: string[];
};

type ColumnIndices = {
  department: number;
  courseNumber: number;
  courseName: number;
  instructors: number;
};

const normalizeWhitespace = (value: string) => value.replaceAll(/\s+/g, " ").trim();

const normalizeInstructorName = (value: string) =>
  normalizeWhitespace(value).toLocaleLowerCase().replaceAll(/[.,]/g, "");

const academicYearLabel = (startYear: number) => `${startYear}-${startYear + 1}`;

const termKey = (term: { year: string; quarter: string }) => `${term.year} ${term.quarter}`;

const scopeKey = (term: { academicYear: string; year: string; quarter: string }) =>
  `${term.academicYear}|${termKey(term)}`;

const offeringKey = (offering: ParsedGraduateChemistryCourseOffering) =>
  `${scopeKey(offering)}|${offering.courseId}`;

const mergeNames = (...groups: string[][]): string[] => {
  const names = new Map<string, string>();
  for (const name of groups.flat()) {
    const normalized = normalizeInstructorName(name);
    if (normalized && !names.has(normalized)) names.set(normalized, name);
  }
  return Array.from(names.values());
};

export function normalizeGraduateChemistryCourseId(sourceCourseNumber: string): string | null {
  const normalized = normalizeWhitespace(sourceCourseNumber.toUpperCase()).replaceAll(/\s+/g, "");
  const match = normalized.match(/^([A-Z]*)(\d+)([A-Z]*)$/);
  if (!match) return null;

  const numeric = Number.parseInt(match[2], 10);
  if (!Number.isInteger(numeric)) return null;
  return `CHEM${match[1]}${numeric}${match[3]}`;
}

export function parseGraduateChemistryInstructorCell(value: string): ParsedInstructorCell {
  const instructors: string[] = [];
  const ignoredNonPersonPlaceholders: string[] = [];
  const candidates = normalizeWhitespace(value)
    .split(/\s*[,/]\s*/)
    .map(normalizeWhitespace)
    .filter(Boolean);

  for (const candidate of candidates) {
    if (/\bTBD\b/i.test(candidate)) continue;
    if (NON_PERSON_PLACEHOLDERS.has(normalizeInstructorName(candidate))) {
      ignoredNonPersonPlaceholders.push(candidate);
      continue;
    }
    instructors.push(candidate);
  }

  return {
    instructors: mergeNames(instructors),
    ignoredNonPersonPlaceholders: mergeNames(ignoredNonPersonPlaceholders),
  };
}

export function parseGraduateChemistryAcademicYear(html: string): {
  academicYear: string;
  startYear: number;
} {
  const $ = load(html);
  const heading = normalizeWhitespace($("#page-title").first().text() || $("title").first().text());
  const match = heading.match(/\b(20\d{2})\s*[-–—]\s*(20\d{2}|\d{2})\b/);
  if (!match) {
    throw new Error(
      "Graduate Chemistry course offerings page did not contain a valid academic year",
    );
  }

  const startYear = Number.parseInt(match[1], 10);
  const endYearValue = Number.parseInt(match[2], 10);
  const endYear =
    match[2].length === 2 ? Math.floor(startYear / 100) * 100 + endYearValue : endYearValue;
  if (endYear !== startYear + 1) {
    throw new Error(
      `Graduate Chemistry listing has nonconsecutive academic year ${match[1]}-${match[2]}`,
    );
  }
  return { academicYear: academicYearLabel(startYear), startYear };
}

export function parseGraduateChemistryTermHeader(
  value: string,
  academicYear: string,
): ParsedGraduateChemistryTerm | null {
  const header = normalizeWhitespace(value.toUpperCase());
  const match = header.match(/^(FALL|WINTER|SPRING)\s+(20\d{2})$/);
  if (!match) return null;

  const quarter = `${match[1][0]}${match[1].slice(1).toLocaleLowerCase()}` as IncludedQuarter;
  return { header, academicYear, year: match[2], quarter };
}

function headerKey(value: string): string {
  return normalizeWhitespace(value).toLocaleLowerCase().replaceAll(/[()]/g, "");
}

function parseColumnIndices(values: string[]): ColumnIndices | null {
  const headers = values.map(headerKey);
  const indices: ColumnIndices = {
    department: headers.indexOf("department"),
    courseNumber: headers.indexOf("course number"),
    courseName: headers.indexOf("course name"),
    instructors: headers.indexOf("instructors"),
  };
  return Object.values(indices).every((index) => index >= 0) ? indices : null;
}

export function parseGraduateChemistryCourseOfferings(
  html: string,
): ParsedGraduateChemistryCourseOfferingsPage {
  const $ = load(html);
  const { academicYear, startYear } = parseGraduateChemistryAcademicYear(html);
  const tables = $("table").filter((_, table) => {
    const text = normalizeWhitespace($(table).text()).toLocaleLowerCase();
    return text.includes("course number") && text.includes("instructor(s)");
  });
  if (tables.length !== 1) {
    throw new Error("Graduate Chemistry listing did not contain exactly one offerings table");
  }

  const terms: ParsedGraduateChemistryTerm[] = [];
  const completedSectionHeaders = new Set<IncludedQuarter>();
  const normalizedRowsByQuarter = new Map<IncludedQuarter, number>();
  const offerings = new Map<string, ParsedGraduateChemistryCourseOffering>();
  const courseIds = new Set<string>();
  const ignoredNonPersonPlaceholders = new Map<string, string>();
  const parsingErrors: string[] = [];
  let sourceRowsParsed = 0;
  let normalizedCourseRows = 0;
  let currentTerm: ParsedGraduateChemistryTerm | null = null;
  let columns: ColumnIndices | null = null;

  tables
    .first()
    .find("tr")
    .each((rowIndex, row) => {
      const cells = $(row).children("th, td");
      const values = cells.toArray().map((cell) => normalizeWhitespace($(cell).text()));
      if (values.every((value) => !value)) return;

      const firstValue = values[0] ?? "";
      const term = parseGraduateChemistryTermHeader(firstValue, academicYear);
      if (term) {
        const expectedYear = term.quarter === "Fall" ? startYear : startYear + 1;
        if (Number.parseInt(term.year, 10) !== expectedYear) {
          parsingErrors.push(
            `${term.header}: expected ${term.quarter} ${expectedYear} for ${academicYear}`,
          );
        }
        if (terms.some(({ quarter }) => quarter === term.quarter)) {
          parsingErrors.push(
            `Graduate Chemistry listing contains duplicate ${term.quarter} sections`,
          );
        }
        terms.push(term);
        currentTerm = term;
        columns = null;
        return;
      }
      if (/^[A-Z]+\s+20\d{2}$/i.test(firstValue)) {
        parsingErrors.push(`Unrecognized graduate Chemistry term heading '${firstValue}'`);
        currentTerm = null;
        columns = null;
        return;
      }

      const parsedColumns = parseColumnIndices(values);
      if (parsedColumns) {
        if (!currentTerm) {
          parsingErrors.push(
            `Graduate Chemistry row ${rowIndex + 1}: column header has no term heading`,
          );
          return;
        }
        columns = parsedColumns;
        completedSectionHeaders.add(currentTerm.quarter);
        return;
      }

      sourceRowsParsed += 1;
      if (!currentTerm || !columns) {
        parsingErrors.push(
          `Graduate Chemistry row ${rowIndex + 1}: course row appears outside a complete term section`,
        );
        return;
      }

      const requiredIndex = Math.max(...Object.values(columns));
      if (cells.length <= requiredIndex) {
        parsingErrors.push(
          `Graduate Chemistry row ${rowIndex + 1}: course row is missing required cells`,
        );
        return;
      }

      const sourceDepartment = normalizeWhitespace(values[columns.department] ?? "");
      const sourceCourseNumber = normalizeWhitespace(values[columns.courseNumber] ?? "");
      if (sourceDepartment.toLocaleLowerCase() !== "chem") {
        parsingErrors.push(
          `Graduate Chemistry row ${rowIndex + 1}: unsupported department '${sourceDepartment}'`,
        );
        return;
      }
      const courseId = normalizeGraduateChemistryCourseId(sourceCourseNumber);
      if (!courseId) {
        parsingErrors.push(
          `Graduate Chemistry row ${rowIndex + 1}: unrecognized course identifier '${sourceCourseNumber}'`,
        );
        return;
      }

      normalizedCourseRows += 1;
      normalizedRowsByQuarter.set(
        currentTerm.quarter,
        (normalizedRowsByQuarter.get(currentTerm.quarter) ?? 0) + 1,
      );
      courseIds.add(courseId);
      const parsedInstructors = parseGraduateChemistryInstructorCell(
        values[columns.instructors] ?? "",
      );
      for (const placeholder of parsedInstructors.ignoredNonPersonPlaceholders) {
        const normalized = normalizeInstructorName(placeholder);
        if (!ignoredNonPersonPlaceholders.has(normalized)) {
          ignoredNonPersonPlaceholders.set(normalized, placeholder);
        }
      }
      const key = offeringKey({
        academicYear,
        courseId,
        year: currentTerm.year,
        quarter: currentTerm.quarter,
        instructors: [],
      });
      const existing = offerings.get(key);
      offerings.set(key, {
        academicYear,
        courseId,
        year: currentTerm.year,
        quarter: currentTerm.quarter,
        instructors: mergeNames(existing?.instructors ?? [], parsedInstructors.instructors),
      });
    });

  for (const quarter of INCLUDED_QUARTERS) {
    if (!terms.some((term) => term.quarter === quarter)) {
      parsingErrors.push(`Graduate Chemistry listing is missing its ${quarter} term heading`);
    }
    if (!completedSectionHeaders.has(quarter)) {
      parsingErrors.push(`Graduate Chemistry listing is missing its ${quarter} column header`);
    }
    if ((normalizedRowsByQuarter.get(quarter) ?? 0) === 0) {
      parsingErrors.push(`Graduate Chemistry listing has no usable ${quarter} course rows`);
    }
  }

  const parsedOfferings = Array.from(offerings.values());
  return {
    sourceRowsParsed,
    normalizedCourseRows,
    instructorNamesParsed: parsedOfferings.reduce(
      (total, offering) => total + offering.instructors.length,
      0,
    ),
    ignoredNonPersonPlaceholders: Array.from(ignoredNonPersonPlaceholders.values()).toSorted(),
    courseIds: Array.from(courseIds).toSorted(),
    offerings: parsedOfferings,
    terms,
    academicYear,
    lastUpdated: null,
    parsingErrors,
  };
}

export function resolveGraduateChemistryInstructors(
  parsed: string[],
  knownInstructors: KnownInstructor[],
): TentativeInstructor[] {
  const resolved: TentativeInstructor[] = [];
  for (const sourceName of mergeNames(parsed)) {
    const normalizedSource = normalizeInstructorName(sourceName);
    const exactMatches = knownInstructors.filter(
      ({ name }) => normalizeInstructorName(name) === normalizedSource,
    );
    const surnameMatches = knownInstructors.filter(({ name }) => {
      const surname = normalizeInstructorName(name).split(" ").at(-1);
      return surname === normalizedSource;
    });
    const candidates = exactMatches.length > 0 ? exactMatches : surnameMatches;
    const chemistryCandidates = candidates.filter(({ department }) =>
      department.toLocaleLowerCase().includes("chemistry"),
    );
    const narrowed = chemistryCandidates.length > 0 ? chemistryCandidates : candidates;
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

export function selectImportableGraduateChemistryOfferings(
  parsed: ParsedGraduateChemistryCourseOfferingsPage,
  calendarTerms: CalendarTermForImport[],
  now: Date,
): ImportableGraduateChemistryOfferings {
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
  const response = await fetcher(CHEMISTRY_GRADUATE_COURSE_OFFERINGS_URL, {
    headers: {
      "User-Agent": "Anteater API tentative course offerings scraper",
    },
  });
  if (!response.ok) {
    throw new Error(
      `Failed to fetch ${CHEMISTRY_GRADUATE_COURSE_OFFERINGS_URL}: HTTP ${response.status}`,
    );
  }
  return await response.text();
}

export async function doScrape(
  db: ReturnType<typeof database>,
  fetcher: typeof fetch = fetch,
  now = new Date(),
): Promise<GraduateChemistryScrapeSummary> {
  const html = await fetchHtml(fetcher);
  const parsed = parseGraduateChemistryCourseOfferings(html);
  if (parsed.sourceRowsParsed === 0 || parsed.normalizedCourseRows === 0) {
    throw new Error("Graduate Chemistry listing did not contain any usable course rows");
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
    (name) => resolveGraduateChemistryInstructors([name], knownInstructors).length === 0,
  );
  for (const name of unresolvedInstructorNames) {
    console.warn(
      `Could not safely resolve graduate Chemistry instructor '${name}'; omitting assignment`,
    );
  }
  for (const placeholder of parsed.ignoredNonPersonPlaceholders) {
    console.warn(`Ignoring graduate Chemistry non-person placeholder '${placeholder}'`);
  }

  const importable = selectImportableGraduateChemistryOfferings(parsed, calendarTerms, now);
  const values: Array<typeof tentativeCourseOffering.$inferInsert> = importable.offerings
    .filter(({ courseId }) => knownCourseIds.has(courseId))
    .map((offering) => ({
      source: CHEMISTRY_GRADUATE_COURSE_OFFERINGS_SOURCE,
      sourceUrl: CHEMISTRY_GRADUATE_COURSE_OFFERINGS_URL,
      academicYear: offering.academicYear,
      courseId: offering.courseId,
      year: offering.year,
      quarter: offering.quarter,
      instructors: resolveGraduateChemistryInstructors(offering.instructors, knownInstructors),
      lastUpdated: parsed.lastUpdated,
    }));

  if (importable.offerings.length > 0 && values.length === 0) {
    throw new Error(
      "Graduate Chemistry listing did not contain future offerings for any known Anteater API courses",
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
              eq(tentativeCourseOffering.source, CHEMISTRY_GRADUATE_COURSE_OFFERINGS_SOURCE),
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
      } as ParsedGraduateChemistryCourseOffering),
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
  // Physical deletion is deactivation for this table. Never clean up from a partial source page.
  const cleanupEnabled = parsed.parsingErrors.length === 0;
  const rowsDeactivated = cleanupEnabled
    ? Array.from(existingKeys).filter((key) => !sourceCurrentKeys.has(key)).length
    : 0;

  if (importable.scopes.length > 0) {
    await db.transaction(async (tx) => {
      for (const scope of importable.scopes) {
        // Include unmatched source IDs so cleanup cannot delete a previously imported row merely
        // because the local course catalogue is temporarily stale.
        const sourceCourseIds = Array.from(
          new Set(
            importable.offerings
              .filter((offering) => scopeKey(offering) === scopeKey(scope))
              .map(({ courseId }) => courseId),
          ),
        );
        const scopeConditions = and(
          eq(tentativeCourseOffering.source, CHEMISTRY_GRADUATE_COURSE_OFFERINGS_SOURCE),
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

  const summary: GraduateChemistryScrapeSummary = {
    sourceRowsParsed: parsed.sourceRowsParsed,
    normalizedCourseRows: parsed.normalizedCourseRows,
    uniqueOfferings: parsed.offerings.length,
    resolvedInstructorAssignments: values.reduce(
      (total, value) => total + value.instructors.length,
      0,
    ),
    unresolvedInstructorNames,
    ignoredNonPersonPlaceholders: parsed.ignoredNonPersonPlaceholders,
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
