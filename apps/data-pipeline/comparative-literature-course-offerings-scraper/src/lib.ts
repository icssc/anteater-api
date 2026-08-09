import type {
  ParsedHumanitiesOffering,
  ParsedHumanitiesSource,
} from "@apps/humanities-course-offerings-scraper";
import {
  HUMANITIES_ACADEMIC_YEAR,
  resolveHumanitiesInstructors,
} from "@apps/humanities-course-offerings-scraper";
import type { database } from "@packages/db";
import { and, eq, inArray, ne, notInArray } from "@packages/db/drizzle";
import type { Term } from "@packages/db/schema";
import { calendarTerm, course, instructor, tentativeCourseOffering } from "@packages/db/schema";
import { conflictUpdateSetAllCols } from "@packages/db/utils";
import {
  COMPARATIVE_LITERATURE_SOURCE,
  COMPARATIVE_LITERATURE_SOURCE_URL,
  type ComparativeLiteratureOcrBox,
  extractComparativeLiteratureOcrBoxes,
  parseComparativeLiteratureOcrBoxes,
  parseComparativeLiteraturePdf,
  renderComparativeLiteraturePdfPage,
} from "./ocr.js";

export type { ComparativeLiteratureOcrBox, ParsedHumanitiesOffering, ParsedHumanitiesSource };
export {
  COMPARATIVE_LITERATURE_SOURCE,
  COMPARATIVE_LITERATURE_SOURCE_URL,
  extractComparativeLiteratureOcrBoxes,
  parseComparativeLiteratureOcrBoxes,
  parseComparativeLiteraturePdf,
  renderComparativeLiteraturePdfPage,
};

type Database = ReturnType<typeof database>;
type Summary = ParsedHumanitiesSource & {
  matchedCourseIds: string[];
  unmatchedCourseIds: string[];
  rowsInserted: number;
  rowsUpdated: number;
  rowsDeactivated: number;
  resolvedInstructorAssignments: number;
};

function scopeKey(value: { academicYear?: string; year: string; quarter: string }) {
  return `${value.academicYear ?? HUMANITIES_ACADEMIC_YEAR}|${value.year}|${value.quarter}`;
}

function offeringKey(value: {
  academicYear?: string;
  courseId: string;
  year: string;
  quarter: string;
}) {
  return `${scopeKey(value)}|${value.courseId}`;
}

export async function importParsedComparativeLiteratureSource(
  db: Database,
  parsed: ParsedHumanitiesSource,
  now: Date,
) {
  const allIds = Array.from(new Set(parsed.offerings.map((offering) => offering.courseId)));
  const [knownCourses, knownInstructors, calendarTerms] = await Promise.all([
    db.select({ id: course.id }).from(course).where(inArray(course.id, allIds)),
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
  const futureTerms = new Set(
    calendarTerms
      .filter((value) => value.instructionStart > now)
      .map((value) => `${value.year}|${value.quarter}`),
  );
  const offerings = parsed.offerings.filter((offering) =>
    futureTerms.has(`${offering.year}|${offering.quarter}`),
  );
  const terms = parsed.terms.filter((term) => futureTerms.has(`${term.year}|${term.quarter}`));
  const known = new Set(knownCourses.map(({ id }) => id));
  const ids = Array.from(new Set(offerings.map((offering) => offering.courseId)));
  const matchedCourseIds = ids.filter((id) => known.has(id));
  const unmatchedCourseIds = ids.filter((id) => !known.has(id));
  const values = offerings
    .filter((offering) => known.has(offering.courseId))
    .map((offering) => ({
      source: COMPARATIVE_LITERATURE_SOURCE,
      sourceUrl: parsed.sourceUrl,
      academicYear: parsed.academicYear,
      courseId: offering.courseId,
      year: offering.year,
      quarter: offering.quarter as Term,
      instructors: resolveHumanitiesInstructors(offering.instructors, knownInstructors),
      lastUpdated: parsed.lastUpdated,
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
        eq(tentativeCourseOffering.source, COMPARATIVE_LITERATURE_SOURCE),
        eq(tentativeCourseOffering.academicYear, parsed.academicYear),
      ),
    );
  const existingKeys = new Set(existing.map((row) => `${scopeKey(row)}|${row.courseId}`));
  const currentKeys = new Set(offerings.map(offeringKey));
  const rowsInserted = values.filter((value) => !existingKeys.has(offeringKey(value))).length;
  const rowsUpdated = values.filter((value) => existingKeys.has(offeringKey(value))).length;
  const protectedIds = new Set(unmatchedCourseIds);
  const currentScopes = terms.filter((term) => term.year === "2026" || term.year === "2027");
  const cleanupAllowed = isComparativeLiteratureCleanupAllowed(parsed);
  const rowsDeactivated = cleanupAllowed
    ? existing.filter(
        (row) =>
          currentScopes.some((scope) => scopeKey(scope) === scopeKey(row)) &&
          !currentKeys.has(`${scopeKey(row)}|${row.courseId}`) &&
          !protectedIds.has(row.courseId),
      ).length
    : 0;
  if (currentScopes.length > 0 && (cleanupAllowed || values.length > 0))
    await db.transaction(async (tx) => {
      if (cleanupAllowed)
        for (const scope of currentScopes) {
          const condition = and(
            eq(tentativeCourseOffering.source, COMPARATIVE_LITERATURE_SOURCE),
            eq(tentativeCourseOffering.academicYear, parsed.academicYear),
            eq(tentativeCourseOffering.year, scope.year),
            eq(tentativeCourseOffering.quarter, scope.quarter),
          );
          const keep = Array.from(
            new Set([
              ...unmatchedCourseIds,
              ...offerings
                .filter((offering) => scopeKey(offering) === scopeKey(scope))
                .map((offering) => offering.courseId),
            ]),
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
  return {
    ...parsed,
    matchedCourseIds,
    unmatchedCourseIds,
    rowsInserted,
    rowsUpdated,
    rowsDeactivated,
    resolvedInstructorAssignments: values.reduce(
      (sum, value) =>
        sum + value.instructors.filter((instructor) => instructor.status === "assigned").length,
      0,
    ),
  } satisfies Summary;
}

export type ComparativeLiteratureScrapeSummary = { sources: Summary[] };

export function isComparativeLiteratureCleanupAllowed(parsed: ParsedHumanitiesSource): boolean {
  return (
    parsed.parsingErrors.length === 0 &&
    [
      ["2026", "Fall"],
      ["2027", "Winter"],
      ["2027", "Spring"],
    ].every(([year, quarter]) =>
      parsed.terms.some((term) => term.year === year && term.quarter === quarter),
    )
  );
}

export async function doScrape(
  db: Database,
  fetcher: typeof fetch = fetch,
  now = new Date(),
): Promise<ComparativeLiteratureScrapeSummary> {
  const response = await fetcher(COMPARATIVE_LITERATURE_SOURCE_URL, {
    headers: { "User-Agent": "Anteater API Comparative Literature importer" },
  });
  if (!response.ok)
    throw new Error(
      `Failed to fetch ${COMPARATIVE_LITERATURE_SOURCE_URL}: HTTP ${response.status}`,
    );
  const parsed = await parseComparativeLiteraturePdf(
    new Uint8Array(await response.arrayBuffer()),
    fetcher,
  );
  const summary = {
    sources: [await importParsedComparativeLiteratureSource(db, parsed, now)],
  };
  console.log(JSON.stringify(summary));
  return summary;
}
