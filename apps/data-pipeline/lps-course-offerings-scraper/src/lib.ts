import type { database } from "@packages/db";
import { and, eq, inArray, ne, notInArray } from "@packages/db/drizzle";
import type { TentativeInstructor, Term } from "@packages/db/schema";
import { calendarTerm, course, instructor, tentativeCourseOffering } from "@packages/db/schema";
import { conflictUpdateSetAllCols } from "@packages/db/utils";
import { load } from "cheerio";

export const LPS_COURSE_OFFERINGS_SOURCE = "LPS_COURSE_OFFERINGS";
export const LPS_COURSE_OFFERINGS_URL = "https://www.lps.uci.edu/grad/courses.php";

const INCLUDED_QUARTERS = ["Fall", "Winter", "Spring"] as const;
type IncludedQuarter = (typeof INCLUDED_QUARTERS)[number];

export type ParsedLpsTerm = {
  header: string;
  academicYear: string;
  year: string;
  quarter: IncludedQuarter;
};

export type ParsedLpsCourseOffering = Omit<ParsedLpsTerm, "header"> & {
  courseId: string;
  instructors: string[];
};

export type ParsedLpsCourseOfferingsPage = {
  sourceRowsParsed: number;
  normalizedCourseRows: number;
  instructorNamesParsed: number;
  duplicateRowsCollapsed: number;
  courseIds: string[];
  offerings: ParsedLpsCourseOffering[];
  terms: ParsedLpsTerm[];
  academicYear: string;
  lastUpdated: null;
  skippedPlaceholders: string[];
  parsingErrors: string[];
};

export type LpsScrapeSummary = ParsedLpsCourseOfferingsPage & {
  uniqueOfferings: number;
  matchedCourseIds: string[];
  unmatchedCourseIds: string[];
  unresolvedInstructorNames: string[];
  rowsInserted: number;
  rowsUpdated: number;
  rowsDeactivated: number;
  skippedOrStaleTerms: string[];
};

type CalendarTermForImport = { year: string; quarter: Term; instructionStart: Date };
type KnownInstructor = { ucinetid: string; name: string; department: string };
type ImportScope = Omit<ParsedLpsTerm, "header">;

const normalize = (value: string) =>
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
  courseId: string;
  year: string;
  quarter: string;
}) => `${scopeKey(offering)}|${offering.courseId}`;

export function normalizeLpsCourseId(value: string): string | null {
  const normalized = normalize(value.toUpperCase()).replaceAll(/\s+/g, "");
  const match = normalized.match(/^LPS(H?\d+[A-Z]*)$/);
  if (!match) return null;
  const number = match[1].match(/^(H?)(\d+)([A-Z]*)$/);
  if (!number) return null;
  return `LPS${number[1]}${Number.parseInt(number[2], 10)}${number[3]}`;
}

export function isLpsPlaceholderCourseId(value: string): boolean {
  return /^LPS\s+\d+\?+$/i.test(normalize(value));
}

export function parseLpsInstructorNames(value: string): string[] {
  const match = normalize(value)
    .replace(/\s*\[[^\]]*\]\s*$/, "")
    .match(/\(([^()]*)\)\s*$/);
  if (!match) return [];
  return match[1]
    .split(/\s*(?:,|&|\band\b)\s*/i)
    .map(normalize)
    .filter((name) => name.length > 0 && !/^(?:TBA|TBD|Staff|\?)$/i.test(name));
}

export function parseLpsAcademicYear(html: string): { academicYear: string; startYear: number } {
  const $ = load(html);
  const headings = $("p strong, h1, h2, h3, h4, h5, h6")
    .toArray()
    .map((node) => normalize($(node).text()));
  const required = headings.filter((value) =>
    /^(Fall|Winter|Spring) 20\d{2} Course Offerings \(Planned\)$/i.test(value),
  );
  const terms = required.flatMap(
    (heading) => heading.match(/^(Fall|Winter|Spring) (20\d{2})/i)?.[2] ?? [],
  );
  const fall = headings.find((value) => /^Fall 20\d{2} Course Offerings \(Planned\)$/i.test(value));
  const match = fall?.match(/^Fall (20\d{2})/i);
  if (!match) throw new Error("LPS listing did not contain a current Fall planned schedule");
  const startYear = Number.parseInt(match[1], 10);
  if (!terms.includes(String(startYear + 1)))
    throw new Error("LPS listing did not contain all current academic-year planned terms");
  return { academicYear: academicYearLabel(startYear), startYear };
}

export function parseLpsTermHeader(value: string, academicYear: string): ParsedLpsTerm | null {
  const header = normalize(value);
  const match = header.match(/^(Fall|Winter|Spring) (20\d{2}) Course Offerings \(Planned\)$/i);
  if (!match) return null;
  const quarter =
    `${match[1][0].toUpperCase()}${match[1].slice(1).toLowerCase()}` as IncludedQuarter;
  return { header, academicYear, year: match[2], quarter };
}

export function parseLpsCourseOfferings(html: string): ParsedLpsCourseOfferingsPage {
  const $ = load(html);
  const { academicYear, startYear } = parseLpsAcademicYear(html);
  const offerings = new Map<string, ParsedLpsCourseOffering>();
  const courseIds = new Set<string>();
  const parsingErrors: string[] = [];
  const skippedPlaceholders = new Set<string>();
  const terms: ParsedLpsTerm[] = [];
  let sourceRowsParsed = 0;
  let normalizedCourseRows = 0;
  let instructorNamesParsed = 0;
  let duplicateRowsCollapsed = 0;

  for (const heading of $("p strong, h1, h2, h3, h4, h5, h6").toArray()) {
    const term = parseLpsTermHeader($(heading).text(), academicYear);
    if (!term) continue;
    if (terms.some((existing) => existing.quarter === term.quarter)) {
      parsingErrors.push(`LPS listing has duplicate ${term.quarter} planned sections`);
      continue;
    }
    const table = $(heading).parent().nextAll("table").first();
    const headers = table
      .find("tr")
      .first()
      .children("th,td")
      .toArray()
      .map((cell) => normalize($(cell).text()));
    const courseColumn = headers.findIndex((value) => /^Course Number$/i.test(value));
    const titleColumn = headers.findIndex((value) => /^Course Title$/i.test(value));
    if (courseColumn < 0 || titleColumn < 0) {
      parsingErrors.push(
        `LPS ${term.header} section is missing Course Number/Course Title columns`,
      );
      continue;
    }
    terms.push(term);
    for (const [rowIndex, row] of table.find("tr").toArray().slice(1).entries()) {
      const cells = $(row).children("th,td");
      const values = cells.toArray().map((cell) => normalize($(cell).text()));
      if (values.every((value) => value.length === 0)) continue;
      sourceRowsParsed += 1;
      if (cells.length <= Math.max(courseColumn, titleColumn)) {
        parsingErrors.push(`LPS ${term.header} row ${rowIndex + 1} is missing required cells`);
        continue;
      }
      const sourceId = values[courseColumn];
      const courseId = normalizeLpsCourseId(sourceId);
      if (!courseId) {
        if (isLpsPlaceholderCourseId(sourceId)) {
          skippedPlaceholders.add(sourceId);
          continue;
        }
        parsingErrors.push(
          `LPS ${term.header} row ${rowIndex + 1} has malformed course identifier '${sourceId}'`,
        );
        continue;
      }
      normalizedCourseRows += 1;
      courseIds.add(courseId);
      const instructors = parseLpsInstructorNames(values[titleColumn]);
      instructorNamesParsed += instructors.length;
      const offering: ParsedLpsCourseOffering = {
        academicYear,
        courseId,
        year: term.year,
        quarter: term.quarter,
        instructors,
      };
      const key = offeringKey(offering);
      const existing = offerings.get(key);
      if (existing) {
        existing.instructors = Array.from(new Set([...existing.instructors, ...instructors]));
        duplicateRowsCollapsed += 1;
      } else offerings.set(key, offering);
    }
  }

  for (const quarter of INCLUDED_QUARTERS) {
    const term = terms.find((value) => value.quarter === quarter);
    if (!term) parsingErrors.push(`LPS listing is missing its required ${quarter} planned section`);
    else if (term.year !== String(quarter === "Fall" ? startYear : startYear + 1))
      parsingErrors.push(`LPS ${term.header} does not belong to academic year ${academicYear}`);
  }
  if (
    terms.length === 3 &&
    terms.every(
      (term) => !Array.from(offerings.values()).some((value) => value.quarter === term.quarter),
    )
  )
    parsingErrors.push("LPS listing contains no usable planned offerings");
  return {
    sourceRowsParsed,
    normalizedCourseRows,
    instructorNamesParsed,
    duplicateRowsCollapsed,
    courseIds: Array.from(courseIds).toSorted(),
    offerings: Array.from(offerings.values()),
    terms: terms.toSorted(
      (a, b) =>
        a.year.localeCompare(b.year) ||
        INCLUDED_QUARTERS.indexOf(a.quarter) - INCLUDED_QUARTERS.indexOf(b.quarter),
    ),
    academicYear,
    lastUpdated: null,
    skippedPlaceholders: Array.from(skippedPlaceholders).toSorted(),
    parsingErrors,
  };
}

function instructorNameMatches(source: string, known: string): boolean {
  const sourceParts = normalize(source)
    .toLowerCase()
    .replace(/[.,]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
  const knownParts = normalize(known)
    .toLowerCase()
    .replace(/[.,]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
  if (sourceParts.length === 1) return knownParts.at(-1) === sourceParts[0];
  return sourceParts.every(
    (part, index) => knownParts[knownParts.length - sourceParts.length + index] === part,
  );
}

export function resolveLpsInstructors(
  names: string[],
  known: KnownInstructor[],
): TentativeInstructor[] {
  return Array.from(new Set(names)).flatMap((name) => {
    const candidates = known.filter((record) => instructorNameMatches(name, record.name));
    return candidates.length === 1
      ? [{ status: "assigned", name, ucinetid: candidates[0].ucinetid }]
      : [];
  });
}

export function selectImportableLpsOfferings(
  parsed: ParsedLpsCourseOfferingsPage,
  calendarTerms: CalendarTermForImport[],
  now: Date,
) {
  const calendarByTerm = new Map(calendarTerms.map((term) => [termKey(term), term]));
  const scopes = new Map<string, ImportScope>();
  const skippedOrStaleTerms = new Set<string>();
  for (const term of parsed.terms) {
    const calendar = calendarByTerm.get(termKey(term));
    if (!calendar) skippedOrStaleTerms.add(`${term.header} (missing calendar metadata)`);
    else if (calendar.instructionStart.getTime() <= now.getTime())
      skippedOrStaleTerms.add(`${term.header} (term has begun)`);
    else
      scopes.set(scopeKey(term), {
        academicYear: term.academicYear,
        year: term.year,
        quarter: term.quarter,
      });
  }
  return {
    offerings: parsed.offerings.filter((offering) => scopes.has(scopeKey(offering))),
    scopes: Array.from(scopes.values()),
    skippedOrStaleTerms: Array.from(skippedOrStaleTerms),
  };
}

async function fetchHtml(fetcher: typeof fetch): Promise<string> {
  const response = await fetcher(LPS_COURSE_OFFERINGS_URL, {
    headers: { "User-Agent": "Anteater API LPS scraper" },
  });
  if (!response.ok)
    throw new Error(`Failed to fetch ${LPS_COURSE_OFFERINGS_URL}: HTTP ${response.status}`);
  return response.text();
}

export async function doScrape(
  db: ReturnType<typeof database>,
  fetcher: typeof fetch = fetch,
  now = new Date(),
): Promise<LpsScrapeSummary> {
  const parsed = parseLpsCourseOfferings(await fetchHtml(fetcher));
  if (parsed.terms.length === 0) throw new Error("LPS listing did not contain a usable schedule");
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
  const importable = selectImportableLpsOfferings(parsed, calendarTerms, now);
  const values = importable.offerings
    .filter(({ courseId }) => knownIds.has(courseId))
    .map((offering) => ({
      source: LPS_COURSE_OFFERINGS_SOURCE,
      sourceUrl: LPS_COURSE_OFFERINGS_URL,
      academicYear: offering.academicYear,
      courseId: offering.courseId,
      year: offering.year,
      quarter: offering.quarter,
      instructors: resolveLpsInstructors(offering.instructors, knownInstructors),
      lastUpdated: null,
    }));
  const scopeKeys = new Set(importable.scopes.map(scopeKey));
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
        eq(tentativeCourseOffering.source, LPS_COURSE_OFFERINGS_SOURCE),
        eq(tentativeCourseOffering.academicYear, parsed.academicYear),
      ),
    );
  const relevantExisting = existing.filter((row) => scopeKeys.has(scopeKey(row)));
  const existingKeys = new Set(relevantExisting.map((row) => offeringKey(row)));
  const currentKeys = new Set(values.map((value) => offeringKey(value)));
  const rowsInserted = Array.from(currentKeys).filter((key) => !existingKeys.has(key)).length;
  const rowsUpdated = Array.from(currentKeys).filter((key) => existingKeys.has(key)).length;
  const rowsDeactivated =
    parsed.parsingErrors.length === 0
      ? relevantExisting.filter(
          (row) => !unmatchedCourseIds.includes(row.courseId) && !currentKeys.has(offeringKey(row)),
        ).length
      : 0;
  if (importable.scopes.length > 0)
    await db.transaction(async (tx) => {
      if (parsed.parsingErrors.length === 0)
        for (const scope of importable.scopes) {
          const keep = Array.from(
            new Set([
              ...unmatchedCourseIds,
              ...importable.offerings
                .filter((offering) => scopeKey(offering) === scopeKey(scope))
                .map(({ courseId }) => courseId),
            ]),
          );
          const condition = and(
            eq(tentativeCourseOffering.source, LPS_COURSE_OFFERINGS_SOURCE),
            eq(tentativeCourseOffering.academicYear, scope.academicYear),
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
  ).filter((name) => resolveLpsInstructors([name], knownInstructors).length === 0);
  const summary = {
    ...parsed,
    uniqueOfferings: parsed.offerings.length,
    matchedCourseIds,
    unmatchedCourseIds,
    unresolvedInstructorNames,
    rowsInserted,
    rowsUpdated,
    rowsDeactivated,
    skippedOrStaleTerms: importable.skippedOrStaleTerms,
  };
  console.log(JSON.stringify(summary));
  return summary;
}
