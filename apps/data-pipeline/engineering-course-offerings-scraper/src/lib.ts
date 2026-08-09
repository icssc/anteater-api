import type { database } from "@packages/db";
import { and, eq, inArray, ne, notInArray } from "@packages/db/drizzle";
import type { TentativeInstructor } from "@packages/db/schema";
import { calendarTerm, course, instructor, tentativeCourseOffering } from "@packages/db/schema";
import { conflictUpdateSetAllCols } from "@packages/db/utils";
import { load } from "cheerio";

export const ENGINEERING_TEACHING_PLAN_COURSE_OFFERINGS_SOURCE =
  "ENGINEERING_TEACHING_PLAN_COURSE_OFFERINGS";
export const ENGINEERING_TEACHING_PLAN_COURSE_OFFERINGS_URL =
  "https://undergraduate.eng.uci.edu/teaching-plan/";
const ENGINEERING_SHEET_HTML_URL =
  "https://docs.google.com/spreadsheets/d/18mynORQ3JU9KsGf5MoaXCvTaLMvThBaeETkdhOPI2iU/gviz/tq?tqx=out:html&gid=0";
const INCLUDED_QUARTERS = ["Fall", "Winter", "Spring"] as const;
type IncludedQuarter = (typeof INCLUDED_QUARTERS)[number];
type KnownInstructor = { ucinetid: string; name: string; department: string };

export type ParsedEngineeringTerm = {
  header: string;
  academicYear: string;
  year: string;
  quarter: IncludedQuarter;
};
export type ParsedEngineeringOffering = ParsedEngineeringTerm & {
  courseId: string;
  instructors: string[];
};
export type ParsedEngineeringPage = {
  sourceRowsParsed: number;
  normalizedCourseRows: number;
  summerCellsSuppressed: number;
  instructorNamesParsed: number;
  duplicateRowsCollapsed: number;
  courseIds: string[];
  terms: ParsedEngineeringTerm[];
  offerings: ParsedEngineeringOffering[];
  academicYear: string;
  lastUpdated: null;
  parsingErrors: string[];
};
export type EngineeringScrapeSummary = ParsedEngineeringPage & {
  uniqueOfferings: number;
  matchedCourseIds: string[];
  unmatchedCourseIds: string[];
  unresolvedInstructorNames: string[];
  rowsInserted: number;
  rowsUpdated: number;
  rowsDeactivated: number;
  skippedOrStaleTerms: string[];
};

const normalize = (value: string) =>
  value
    .normalize("NFKC")
    .replaceAll(/[\u200B-\u200D\u2060\uFEFF]/g, "")
    .replaceAll(/[\s\p{Z}]+/gu, " ")
    .trim();
const academicYearLabel = (year: number) => `${year}-${year + 1}`;
const termKey = (value: { year: string; quarter: string }) => `${value.year} ${value.quarter}`;
const scopeKey = (value: { academicYear: string; year: string; quarter: string }) =>
  `${value.academicYear}|${termKey(value)}`;
const offeringKey = (value: {
  academicYear: string;
  courseId: string;
  year: string;
  quarter: string;
}) => `${scopeKey(value)}|${value.courseId}`;
const isCancellation = (value: string) => /\bcancel(?:l)?ed\b/i.test(value);

export function normalizeEngineeringCourseId(value: string): string | null {
  const normalized = normalize(value.toUpperCase());
  const match = normalized.match(/^([A-Z&]+)\s+([A-Z]*\d+[A-Z]*)/);
  if (!match) return null;
  const number = match[2].match(/^([A-Z]*)(\d+)([A-Z]*)$/);
  if (!number) return null;
  return `${match[1]}${number[1]}${Number.parseInt(number[2], 10)}${number[3]}`;
}

export function parseEngineeringAcademicYear(html: string): {
  academicYear: string;
  startYear: number;
} {
  const $ = load(html);
  const title =
    normalize($("title").first().text()) ||
    normalize($("body").text()).match(/20\d{2}\s*[-–—]\s*20\d{2}/)?.[0] ||
    "";
  const match = title.match(/(20\d{2})\s*[-–—]\s*(20\d{2}|\d{2})/);
  if (!match) throw new Error("Engineering teaching plan did not contain a valid academic year");
  const startYear = Number.parseInt(match[1], 10);
  const endYear =
    match[2].length === 2
      ? Math.floor(startYear / 100) * 100 + Number.parseInt(match[2], 10)
      : Number.parseInt(match[2], 10);
  if (endYear !== startYear + 1)
    throw new Error(
      `Engineering teaching plan has nonconsecutive academic year ${match[1]}-${match[2]}`,
    );
  return { academicYear: academicYearLabel(startYear), startYear };
}

function parseEngineeringTerm(value: string, academicYear: string): ParsedEngineeringTerm | null {
  const match = normalize(value).match(/^(Fall|Winter|Spring) (20\d{2})$/i);
  if (!match) return null;
  const quarter =
    `${match[1][0].toUpperCase()}${match[1].slice(1).toLowerCase()}` as IncludedQuarter;
  return { header: normalize(value), academicYear, year: match[2], quarter };
}

export function parseEngineeringInstructorNames(value: string): string[] {
  let normalized = normalize(value);
  if (
    !normalized ||
    /^(?:staff|various|see soc|tbd|tba|\?|not offered)/i.test(normalized) ||
    /^(?:SSI|SSII|SS1|SS10WK)(?:\s*&\s*(?:SSI|SSII|SS1|SS10WK))?(?:\s*\(online\))?(?:\s*[-:]\s*(?:staff|various))?$/i.test(
      normalized,
    )
  )
    return [];
  normalized = normalized.replace(/^(?:SSI|SSII|SS1|SS10WK)(?:\s*\(online\))?\s*[-:]\s*/i, "");
  normalized = normalized.replace(/^[^:]+:\s*/, "");
  return normalized
    .split(/\s*(?:;|,|&|\band\b)\s*/i)
    .map(normalize)
    .filter((name) => name && !/^(?:staff|various|see soc|tbd|tba|\?)$/i.test(name));
}

export function parseEngineeringCourseOfferings(html: string): ParsedEngineeringPage {
  const $ = load(html);
  const { academicYear, startYear } = parseEngineeringAcademicYear(html);
  const table = $("table").first();
  const rows = table.find("tr").toArray();
  const parsingErrors: string[] = [];
  const headers = rows[2]
    ? $(rows[2])
        .children("td,th")
        .toArray()
        .map((cell) => normalize($(cell).text()))
    : [];
  const terms = headers
    .map((header) => parseEngineeringTerm(header, academicYear))
    .filter((term): term is ParsedEngineeringTerm => term !== null)
    .map((term) => ({ ...term, columnIndex: headers.indexOf(term.header) }));
  const offerings = new Map<string, ParsedEngineeringOffering>();
  const courseIds = new Set<string>();
  let sourceRowsParsed = 0;
  let normalizedCourseRows = 0;
  let summerCellsSuppressed = 0;
  let instructorNamesParsed = 0;
  let duplicateRowsCollapsed = 0;
  const sourceTermColumns = headers
    .map((header, index) => ({ header, index }))
    .filter(({ header }) => /^(Summer|Fall|Winter|Spring) 20\d{2}$/.test(header));
  const sourceTermColumnIndexes = new Set(sourceTermColumns.map(({ index }) => index));
  let previousCourseId: string | null = null;
  for (const [rowIndex, row] of rows.slice(3).entries()) {
    const cells = $(row).children("td,th");
    const values = cells.toArray().map((cell) => normalize($(cell).text()));
    const sourceCourse = values[1] ?? "";
    if (!cells.toArray().some((cell) => normalize($(cell).text()).length > 0)) continue;
    const parsedCourseId = sourceCourse ? normalizeEngineeringCourseId(sourceCourse) : null;
    if (sourceCourse && !parsedCourseId) {
      previousCourseId = null; // section labels in column B are not course rows.
      continue;
    }
    const courseId = parsedCourseId ?? previousCourseId;
    if (!courseId) continue;
    if (parsedCourseId) {
      previousCourseId = parsedCourseId;
      sourceRowsParsed += 1;
      normalizedCourseRows += 1;
    }
    courseIds.add(courseId);
    const rowIsCanceled = values.some(
      (value, index) => !sourceTermColumnIndexes.has(index) && isCancellation(value),
    );
    for (const { header, index } of sourceTermColumns) {
      const marker = values[index] ?? "";
      if (!marker) continue;
      if (/^Summer /i.test(header)) {
        summerCellsSuppressed += 1;
        continue;
      }
      const term = parseEngineeringTerm(header, academicYear);
      if (!term) continue;
      if (rowIsCanceled || isCancellation(marker)) continue;
      const instructors = parseEngineeringInstructorNames(marker);
      instructorNamesParsed += instructors.length;
      const offering = { ...term, courseId, instructors };
      const key = offeringKey(offering);
      const existing = offerings.get(key);
      if (existing) {
        existing.instructors = Array.from(new Set([...existing.instructors, ...instructors]));
        duplicateRowsCollapsed += 1;
      } else offerings.set(key, offering);
    }
    if (cells.length < 6)
      parsingErrors.push(`Engineering row ${rowIndex + 4} is missing expected term columns`);
  }
  for (const quarter of INCLUDED_QUARTERS) {
    const term = terms.find((value) => value.quarter === quarter);
    const expectedYear = quarter === "Fall" ? startYear : startYear + 1;
    if (!term)
      parsingErrors.push(`Engineering teaching plan is missing its required ${quarter} column`);
    else if (term.year !== String(expectedYear))
      parsingErrors.push(
        `Engineering ${term.header} does not belong to academic year ${academicYear}`,
      );
    else if (!Array.from(offerings.values()).some((offering) => offering.quarter === quarter))
      parsingErrors.push(`Engineering teaching plan has no usable ${quarter} offerings`);
  }
  return {
    sourceRowsParsed,
    normalizedCourseRows,
    summerCellsSuppressed,
    instructorNamesParsed,
    duplicateRowsCollapsed,
    courseIds: Array.from(courseIds).toSorted(),
    terms: terms.map(({ columnIndex: _, ...term }) => term),
    offerings: Array.from(offerings.values()),
    academicYear,
    lastUpdated: null,
    parsingErrors,
  };
}

export function shouldCleanupEngineeringSource(parsed: ParsedEngineeringPage): boolean {
  return parsed.parsingErrors.length === 0;
}

function instructorMatches(source: string, known: string): boolean {
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
function resolveEngineeringInstructors(
  names: string[],
  known: KnownInstructor[],
): TentativeInstructor[] {
  return Array.from(new Set(names)).flatMap((name) => {
    const matches = known.filter((record) => instructorMatches(name, record.name));
    return matches.length === 1
      ? [{ status: "assigned", name, ucinetid: matches[0].ucinetid }]
      : [];
  });
}

async function fetchHtml(fetcher: typeof fetch): Promise<string> {
  const response = await fetcher(ENGINEERING_SHEET_HTML_URL, {
    headers: { "User-Agent": "Anteater API Engineering scraper" },
  });
  if (!response.ok)
    throw new Error(`Failed to fetch ${ENGINEERING_SHEET_HTML_URL}: HTTP ${response.status}`);
  return response.text();
}

export async function doScrape(
  db: ReturnType<typeof database>,
  fetcher: typeof fetch = fetch,
  now = new Date(),
): Promise<EngineeringScrapeSummary> {
  const parsed = parseEngineeringCourseOfferings(await fetchHtml(fetcher));
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
  const future = new Set(
    calendarTerms.filter((term) => term.instructionStart.getTime() > now.getTime()).map(termKey),
  );
  const offerings = parsed.offerings.filter((offering) => future.has(termKey(offering)));
  const terms = parsed.terms.filter((term) => future.has(termKey(term)));
  const values = offerings
    .filter(({ courseId }) => knownIds.has(courseId))
    .map((offering) => ({
      source: ENGINEERING_TEACHING_PLAN_COURSE_OFFERINGS_SOURCE,
      sourceUrl: ENGINEERING_TEACHING_PLAN_COURSE_OFFERINGS_URL,
      academicYear: offering.academicYear,
      courseId: offering.courseId,
      year: offering.year,
      quarter: offering.quarter,
      instructors: resolveEngineeringInstructors(offering.instructors, knownInstructors),
      lastUpdated: null,
    }));
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
        eq(tentativeCourseOffering.source, ENGINEERING_TEACHING_PLAN_COURSE_OFFERINGS_SOURCE),
        eq(tentativeCourseOffering.academicYear, parsed.academicYear),
      ),
    );
  const futureScopeKeys = new Set(terms.map((term) => scopeKey(term)));
  const relevantExisting = existing.filter((row) => futureScopeKeys.has(scopeKey(row)));
  const existingKeys = new Set(relevantExisting.map((row) => offeringKey(row)));
  const currentKeys = new Set(values.map((value) => offeringKey(value)));
  const rowsInserted = Array.from(currentKeys).filter((key) => !existingKeys.has(key)).length;
  const rowsUpdated = Array.from(currentKeys).filter((key) => existingKeys.has(key)).length;
  const cleanupEnabled = shouldCleanupEngineeringSource(parsed);
  const rowsDeactivated = cleanupEnabled
    ? relevantExisting.filter(
        (row) => !unmatchedCourseIds.includes(row.courseId) && !currentKeys.has(offeringKey(row)),
      ).length
    : 0;
  if (terms.length > 0)
    await db.transaction(async (tx) => {
      if (cleanupEnabled)
        for (const term of terms) {
          const keep = Array.from(
            new Set([
              ...unmatchedCourseIds,
              ...offerings
                .filter((offering) => termKey(offering) === termKey(term))
                .map(({ courseId }) => courseId),
            ]),
          );
          const condition = and(
            eq(tentativeCourseOffering.source, ENGINEERING_TEACHING_PLAN_COURSE_OFFERINGS_SOURCE),
            eq(tentativeCourseOffering.academicYear, parsed.academicYear),
            eq(tentativeCourseOffering.year, term.year),
            eq(tentativeCourseOffering.quarter, term.quarter),
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
  ).filter((name) => resolveEngineeringInstructors([name], knownInstructors).length === 0);
  const summary = {
    ...parsed,
    uniqueOfferings: parsed.offerings.length,
    matchedCourseIds,
    unmatchedCourseIds,
    unresolvedInstructorNames,
    rowsInserted,
    rowsUpdated,
    rowsDeactivated,
    skippedOrStaleTerms: parsed.terms
      .filter((term) => !future.has(termKey(term)))
      .map((term) => `${term.header} (term has begun or missing calendar metadata)`),
  };
  console.log(JSON.stringify(summary));
  return summary;
}
