import type { database } from "@packages/db";
import { and, eq, inArray, ne, notInArray } from "@packages/db/drizzle";
import type { TentativeInstructor, Term } from "@packages/db/schema";
import { calendarTerm, course, instructor, tentativeCourseOffering } from "@packages/db/schema";
import { conflictUpdateSetAllCols } from "@packages/db/utils";
import { type Cheerio, load } from "cheerio";
import type { Element } from "domhandler";

export const GLOBAL_STUDIES_COURSE_OFFERINGS_SOURCE = "GLOBAL_STUDIES_COURSE_OFFERINGS";
export const GLOBAL_STUDIES_COURSE_OFFERINGS_URL =
  "https://www.globalstudies.uci.edu/undergrad/courses.php";

// The source has no structured Summer section. We intentionally import only these future terms.
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

type KnownInstructor = { ucinetid: string; name: string; department: string };
type CalendarTermForImport = { year: string; quarter: Term; instructionStart: Date };

export type ParsedGlobalStudiesTerm = {
  header: string;
  academicYear: string;
  year: string;
  quarter: IncludedQuarter;
};
export type ParsedGlobalStudiesCourseOffering = Omit<ParsedGlobalStudiesTerm, "header"> & {
  courseId: string;
  instructors: string[];
};
export type ParsedGlobalStudiesCourseOfferingsPage = {
  sourceBlocksByQuarter: Record<IncludedQuarter, number>;
  normalizedBlocks: number;
  offeringsByQuarter: Record<IncludedQuarter, number>;
  uniqueOfferings: number;
  uniqueCourseIds: number;
  duplicateRowsCollapsed: number;
  duplicate179BlocksCollapsed: number;
  duplicate189BlocksCollapsed: number;
  parsedInstructorAssignments: number;
  ignoredTbdTbaValues: number;
  courseIds: string[];
  offerings: ParsedGlobalStudiesCourseOffering[];
  terms: ParsedGlobalStudiesTerm[];
  scheduleSectionsDiscovered: number;
  academicYear: string | null;
  lastUpdated: Date | null;
  parsingErrors: string[];
};
export type GlobalStudiesScrapeSummary = {
  sourceBlocksByQuarter: Record<IncludedQuarter, number>;
  normalizedBlocks: number;
  offeringsByQuarter: Record<IncludedQuarter, number>;
  uniqueOfferings: number;
  uniqueCourseIds: number;
  duplicateRowsCollapsed: number;
  duplicate179BlocksCollapsed: number;
  duplicate189BlocksCollapsed: number;
  parsedInstructorAssignments: number;
  resolvedInstructorAssignments: number;
  unresolvedInstructorNames: string[];
  ignoredTbdTbaValues: number;
  matchedCourseIds: string[];
  unmatchedCourseIds: string[];
  rowsInserted: number;
  rowsUpdated: number;
  rowsDeactivated: number;
  displayedSourceUpdateDate: Date | null;
  skippedOrStaleTerms: string[];
  parsingErrors: string[];
};

type ImportScope = Omit<ParsedGlobalStudiesTerm, "header">;
type InstructorParseResult = { names: string[]; ignored: number };

const normalizeWhitespace = (value: string) =>
  value
    .normalize("NFKC")
    .replaceAll(/[\u200B-\u200D\u2060\uFEFF]/g, "")
    .replaceAll(/[\s\p{Z}]+/gu, " ")
    .trim();
export const normalizeGlobalStudiesText = (value: string) => normalizeWhitespace(value);
const academicYearLabel = (start: number) => `${start}-${start + 1}`;
const termKey = (term: { year: string; quarter: string }) => `${term.year} ${term.quarter}`;
const scopeKey = (term: { academicYear: string; year: string; quarter: string }) =>
  `${term.academicYear}|${termKey(term)}`;
const offeringKey = (offering: {
  academicYear: string;
  year: string;
  quarter: string;
  courseId: string;
}) => `${scopeKey(offering)}|${offering.courseId}`;
const emptyQuarterCounts = (): Record<IncludedQuarter, number> => ({
  Fall: 0,
  Winter: 0,
  Spring: 0,
});

export function normalizeGlobalStudiesCourseId(sourceCourseId: string): string | null {
  const value = normalizeWhitespace(sourceCourseId).toUpperCase();
  const match = value.match(/^INTL\s+ST\s+(H?\d+[A-Z]*)$/);
  if (!match) return null;
  const numberMatch = match[1].match(/^(H?)(\d+)([A-Z]*)$/);
  if (!numberMatch) return null;
  return `INTLST${numberMatch[1]}${Number.parseInt(numberMatch[2], 10)}${numberMatch[3]}`;
}

export function parseGlobalStudiesAcademicYear(
  html: string,
): { academicYear: string; startYear: number } | null {
  const $ = load(html);
  const heading = $("h1,h2,h3,h4,h5,h6")
    .toArray()
    .map((el) => normalizeWhitespace($(el).text()))
    .find((text) => /^Tentative Course Offerings Schedule\s+20\d{2}/i.test(text));
  const match = heading?.match(
    /^Tentative Course Offerings Schedule\s+(20\d{2})\s*[-–—](20\d{2}|\d{2})$/i,
  );
  if (!match) return null;
  const startYear = Number.parseInt(match[1], 10);
  const end = Number.parseInt(match[2], 10);
  const endYear = match[2].length === 2 ? Math.floor(startYear / 100) * 100 + end : end;
  return endYear === startYear + 1
    ? { academicYear: academicYearLabel(startYear), startYear }
    : null;
}

export function parseGlobalStudiesLastUpdated(html: string): Date | null {
  const text = normalizeWhitespace(load(html).root().text());
  const match = text.match(/\bLast updated:\s+([A-Za-z]+)\s+(\d{1,2}),\s+(20\d{2})\b/i);
  if (!match) return null;
  const month = MONTHS.indexOf(match[1].toLowerCase() as (typeof MONTHS)[number]);
  const day = Number.parseInt(match[2], 10);
  const year = Number.parseInt(match[3], 10);
  if (month < 0 || day < 1 || day > 31) return null;
  const date = new Date(Date.UTC(year, month, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month && date.getUTCDate() === day
    ? date
    : null;
}

export function parseGlobalStudiesTermHeader(
  value: string,
  academic: { academicYear: string; startYear: number },
): ParsedGlobalStudiesTerm | null {
  const header = normalizeWhitespace(value);
  const match = header.match(/^(Fall|Winter|Spring)\s+(20\d{2})$/i);
  if (!match) return null;
  const quarter =
    `${match[1][0].toUpperCase()}${match[1].slice(1).toLowerCase()}` as IncludedQuarter;
  const year = match[2];
  const expected = quarter === "Fall" ? academic.startYear : academic.startYear + 1;
  return Number.parseInt(year, 10) === expected
    ? { header, academicYear: academic.academicYear, year, quarter }
    : null;
}

function fieldValue(paragraph: Cheerio<Element>): string {
  const clone = paragraph.clone();
  clone.find("strong").remove();
  clone.find("br").replaceWith(" ");
  return normalizeWhitespace(clone.text());
}

function parseBlockFields(
  $: ReturnType<typeof load>,
  row: Element,
): { fields: Map<string, string>; error: string | null } {
  const fields = new Map<string, string>();
  for (const paragraph of $(row).find("p").toArray()) {
    const label = normalizeWhitespace($(paragraph).find("strong").first().text()).toLowerCase();
    if (!["course number", "course title", "instructor", "description"].includes(label)) continue;
    if (fields.has(label)) return { fields, error: `duplicate ${label} label` };
    fields.set(label, fieldValue($(paragraph)));
  }
  for (const label of ["course number", "course title", "instructor", "description"]) {
    if (!fields.has(label)) return { fields, error: `missing ${label} label` };
  }
  return { fields, error: null };
}

export function parseGlobalStudiesInstructor(value: string): InstructorParseResult {
  const name = normalizeWhitespace(value);
  if (!name || /^(?:TBA|TBD)$/i.test(name)) return { names: [], ignored: name ? 1 : 0 };
  return { names: [name], ignored: 0 };
}

function normalizeInstructorName(value: string): string {
  return normalizeWhitespace(value)
    .replace(/[‐‑‒–—―-]/gu, " ")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/gu, " ")
    .trim()
    .toLowerCase();
}
function instructorMatches(source: string, known: string): boolean {
  const sourceParts = normalizeInstructorName(source).split(" ").filter(Boolean);
  const knownParts = normalizeInstructorName(known).split(" ").filter(Boolean);
  return (
    sourceParts.length > 0 &&
    knownParts.length >= sourceParts.length &&
    sourceParts.every((p, i) => p === knownParts[knownParts.length - sourceParts.length + i])
  );
}
export function resolveGlobalStudiesInstructors(
  parsed: string[],
  known: KnownInstructor[],
): TentativeInstructor[] {
  const resolved: TentativeInstructor[] = [];
  for (const sourceName of Array.from(new Set(parsed)).toSorted()) {
    const candidates = known.filter(({ name }) => instructorMatches(sourceName, name));
    const preferred = candidates.filter(({ department }) =>
      /global|international studies/i.test(department),
    );
    const narrowed = preferred.length > 0 ? preferred : candidates;
    if (narrowed.length === 1)
      resolved.push({ status: "assigned", name: sourceName, ucinetid: narrowed[0].ucinetid });
  }
  return resolved;
}

function tableForTerm($: ReturnType<typeof load>, heading: Element): Cheerio<Element> | null {
  const parent = $(heading).parent().first();
  const children = parent.children().toArray();
  const index = children.indexOf(heading);
  for (let i = index + 1; i < children.length; i += 1) {
    const child = children[i];
    if (
      /^h[1-6]$/i.test(child.name) &&
      /^(?:Fall|Winter|Spring)\s+20\d{2}$/i.test(normalizeWhitespace($(child).text()))
    ) {
      break;
    }
    if (child.type === "tag" && child.name === "table") return $(child);
  }
  return null;
}

export function parseGlobalStudiesCourseOfferings(
  html: string,
): ParsedGlobalStudiesCourseOfferingsPage {
  const $ = load(html);
  const academic = parseGlobalStudiesAcademicYear(html);
  const errors: string[] = [];
  if (!academic)
    errors.push("Global Studies listing is missing a valid academic-year schedule heading");
  const scheduleHeading = $("h1,h2,h3,h4,h5,h6")
    .toArray()
    .find((el) =>
      /^Tentative Course Offerings Schedule\s+20\d{2}/i.test(normalizeWhitespace($(el).text())),
    );
  const root = scheduleHeading ? $(scheduleHeading).parent().first() : null;
  const sections = new Map<
    IncludedQuarter,
    { term: ParsedGlobalStudiesTerm; table: Cheerio<Element> }
  >();
  if (root && academic) {
    for (const heading of root.find("h2,h3,h4,h5,h6").toArray()) {
      const term = parseGlobalStudiesTermHeader($(heading).text(), academic);
      if (!term) continue;
      const table = tableForTerm($, heading);
      if (!table) {
        errors.push(`Global Studies listing is missing the ${term.quarter} table`);
        continue;
      }
      if (sections.has(term.quarter))
        errors.push(`Global Studies listing has duplicate ${term.quarter} sections`);
      else sections.set(term.quarter, { term, table });
    }
  }
  const sourceBlocksByQuarter = emptyQuarterCounts();
  const offeringsByQuarter = emptyQuarterCounts();
  const offerings = new Map<string, ParsedGlobalStudiesCourseOffering>();
  const courseIds = new Set<string>();
  let normalizedBlocks = 0;
  let duplicateRowsCollapsed = 0;
  let duplicate179BlocksCollapsed = 0;
  let duplicate189BlocksCollapsed = 0;
  let parsedInstructorAssignments = 0;
  let ignoredTbdTbaValues = 0;
  for (const quarter of INCLUDED_QUARTERS) {
    const section = sections.get(quarter);
    if (!section) continue;
    const rows = section.table.find("tbody tr").toArray();
    for (const [rowIndex, row] of rows.entries()) {
      if (!normalizeWhitespace($(row).text())) continue;
      sourceBlocksByQuarter[quarter] += 1;
      const parsed = parseBlockFields($, row);
      if (parsed.error) {
        errors.push(`Global Studies ${quarter} block ${rowIndex + 1}: ${parsed.error}`);
        continue;
      }
      const sourceId = parsed.fields.get("course number") ?? "";
      const courseId = normalizeGlobalStudiesCourseId(sourceId);
      if (!courseId) {
        errors.push(
          `Global Studies ${quarter} block ${rowIndex + 1} has malformed course identifier '${sourceId}'`,
        );
        continue;
      }
      normalizedBlocks += 1;
      courseIds.add(courseId);
      const instructorResult = parseGlobalStudiesInstructor(parsed.fields.get("instructor") ?? "");
      parsedInstructorAssignments += instructorResult.names.length;
      ignoredTbdTbaValues += instructorResult.ignored;
      const offering: ParsedGlobalStudiesCourseOffering = {
        ...section.term,
        courseId,
        instructors: instructorResult.names,
      };
      const key = offeringKey(offering);
      const previous = offerings.get(key);
      if (previous) {
        duplicateRowsCollapsed += 1;
        if (courseId === "INTLST179") duplicate179BlocksCollapsed += 1;
        if (courseId === "INTLST189") duplicate189BlocksCollapsed += 1;
        previous.instructors = Array.from(
          new Set([...previous.instructors, ...instructorResult.names]),
        );
      } else {
        offerings.set(key, offering);
        offeringsByQuarter[quarter] += 1;
      }
    }
    if (sourceBlocksByQuarter[quarter] === 0 || offeringsByQuarter[quarter] === 0)
      errors.push(`Global Studies listing has no usable ${quarter} course blocks`);
  }
  for (const quarter of INCLUDED_QUARTERS)
    if (!sections.has(quarter))
      errors.push(`Global Studies listing is missing its ${quarter} section`);
  const parsedOfferings = Array.from(offerings.values());
  const scheduleSectionsDiscovered = sections.size;
  const lastUpdated = parseGlobalStudiesLastUpdated(root?.text() ?? html);
  if (/Last updated:/i.test(root?.text() ?? html) && !lastUpdated)
    errors.push("Could not parse Global Studies listing's Last updated value");
  return {
    sourceBlocksByQuarter,
    normalizedBlocks,
    offeringsByQuarter,
    uniqueOfferings: parsedOfferings.length,
    uniqueCourseIds: courseIds.size,
    duplicateRowsCollapsed,
    duplicate179BlocksCollapsed,
    duplicate189BlocksCollapsed,
    parsedInstructorAssignments,
    ignoredTbdTbaValues,
    courseIds: Array.from(courseIds).toSorted(),
    offerings: parsedOfferings,
    terms: INCLUDED_QUARTERS.flatMap((q) => {
      const term = sections.get(q)?.term;
      return term ? [term] : [];
    }),
    scheduleSectionsDiscovered,
    academicYear: academic?.academicYear ?? null,
    lastUpdated,
    parsingErrors: errors,
  };
}

export function selectImportableGlobalStudiesOfferings(
  parsed: ParsedGlobalStudiesCourseOfferingsPage,
  calendarTerms: CalendarTermForImport[],
  now: Date,
): {
  offerings: ParsedGlobalStudiesCourseOffering[];
  scopes: ImportScope[];
  skippedOrStaleTerms: string[];
} {
  const byTerm = new Map(calendarTerms.map((term) => [termKey(term), term]));
  const scopeMap = new Map<string, ImportScope>();
  const skipped = new Set<string>();
  for (const term of parsed.terms) {
    const calendar = byTerm.get(termKey(term));
    if (!calendar) skipped.add(`${term.header} (missing calendar metadata)`);
    else if (calendar.instructionStart.getTime() <= now.getTime())
      skipped.add(`${term.header} (term has begun)`);
    else
      scopeMap.set(scopeKey(term), {
        academicYear: term.academicYear,
        year: term.year,
        quarter: term.quarter,
      });
  }
  return {
    offerings: parsed.offerings.filter((o) => scopeMap.has(scopeKey(o))),
    scopes: Array.from(scopeMap.values()),
    skippedOrStaleTerms: Array.from(skipped),
  };
}

async function fetchHtml(fetcher: typeof fetch): Promise<string> {
  const response = await fetcher(GLOBAL_STUDIES_COURSE_OFFERINGS_URL, {
    headers: { "User-Agent": "Anteater API tentative course offerings scraper" },
  });
  if (!response.ok)
    throw new Error(
      `Failed to fetch ${GLOBAL_STUDIES_COURSE_OFFERINGS_URL}: HTTP ${response.status}`,
    );
  return response.text();
}

export async function doScrape(
  db: ReturnType<typeof database>,
  fetcher: typeof fetch = fetch,
  now = new Date(),
): Promise<GlobalStudiesScrapeSummary> {
  const parsed = parseGlobalStudiesCourseOfferings(await fetchHtml(fetcher));
  if (
    parsed.academicYear === null ||
    parsed.scheduleSectionsDiscovered !== INCLUDED_QUARTERS.length ||
    parsed.terms.length !== INCLUDED_QUARTERS.length ||
    parsed.normalizedBlocks === 0
  )
    throw new Error("Global Studies listing did not contain all undergraduate quarter sections");
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
  const known = new Set(knownCourses.map(({ id }) => id));
  const matchedCourseIds = parsed.courseIds.filter((id) => known.has(id));
  const unmatchedCourseIds = parsed.courseIds.filter((id) => !known.has(id));
  const names = Array.from(new Set(parsed.offerings.flatMap((o) => o.instructors))).toSorted();
  const unresolvedInstructorNames = names.filter(
    (name) => resolveGlobalStudiesInstructors([name], knownInstructors).length === 0,
  );
  for (const name of unresolvedInstructorNames)
    console.warn(
      `Could not safely resolve Global Studies instructor '${name}'; omitting assignment`,
    );
  const importable = selectImportableGlobalStudiesOfferings(parsed, calendarTerms, now);
  const values: Array<typeof tentativeCourseOffering.$inferInsert> = importable.offerings
    .filter((o) => known.has(o.courseId))
    .map((o) => ({
      source: GLOBAL_STUDIES_COURSE_OFFERINGS_SOURCE,
      sourceUrl: GLOBAL_STUDIES_COURSE_OFFERINGS_URL,
      academicYear: o.academicYear,
      courseId: o.courseId,
      year: o.year,
      quarter: o.quarter,
      instructors: resolveGlobalStudiesInstructors(o.instructors, knownInstructors),
      lastUpdated: parsed.lastUpdated,
    }));
  if (importable.offerings.length > 0 && values.length === 0)
    throw new Error(
      "Global Studies listing did not contain future offerings for known Anteater API courses",
    );
  const scopeKeys = new Set(importable.scopes.map(scopeKey));
  const academicYears = Array.from(new Set(importable.scopes.map((s) => s.academicYear)));
  const existing =
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
              eq(tentativeCourseOffering.source, GLOBAL_STUDIES_COURSE_OFFERINGS_SOURCE),
              inArray(tentativeCourseOffering.academicYear, academicYears),
            ),
          )
      : [];
  const relevant = existing.filter((row) => scopeKeys.has(scopeKey(row)));
  const existingKeys = new Set(relevant.map((row) => offeringKey(row)));
  const currentKeys = new Set(values.map((v) => offeringKey(v)));
  const rowsInserted = Array.from(currentKeys).filter((k) => !existingKeys.has(k)).length;
  const rowsUpdated = Array.from(currentKeys).filter((k) => existingKeys.has(k)).length;
  const sourceCurrentKeys = new Set(importable.offerings.map(offeringKey));
  for (const row of relevant)
    if (unmatchedCourseIds.includes(row.courseId)) sourceCurrentKeys.add(offeringKey(row));
  const cleanupEnabled = parsed.parsingErrors.length === 0;
  const rowsDeactivated = cleanupEnabled
    ? Array.from(existingKeys).filter((k) => !sourceCurrentKeys.has(k)).length
    : 0;
  if (importable.scopes.length > 0)
    await db.transaction(async (tx) => {
      for (const scope of importable.scopes) {
        const sourceCourseIds = Array.from(
          new Set([
            ...unmatchedCourseIds,
            ...importable.offerings
              .filter((o) => scopeKey(o) === scopeKey(scope))
              .map((o) => o.courseId),
          ]),
        );
        const conditions = and(
          eq(tentativeCourseOffering.source, GLOBAL_STUDIES_COURSE_OFFERINGS_SOURCE),
          eq(tentativeCourseOffering.academicYear, scope.academicYear),
          eq(tentativeCourseOffering.year, scope.year),
          eq(tentativeCourseOffering.quarter, scope.quarter),
        );
        if (cleanupEnabled)
          await tx
            .delete(tentativeCourseOffering)
            .where(
              sourceCourseIds.length > 0
                ? and(conditions, notInArray(tentativeCourseOffering.courseId, sourceCourseIds))
                : conditions,
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
  const resolvedInstructorAssignments = parsed.offerings.reduce(
    (sum, o) => sum + resolveGlobalStudiesInstructors(o.instructors, knownInstructors).length,
    0,
  );
  const summary = {
    sourceBlocksByQuarter: parsed.sourceBlocksByQuarter,
    normalizedBlocks: parsed.normalizedBlocks,
    offeringsByQuarter: parsed.offeringsByQuarter,
    uniqueOfferings: parsed.uniqueOfferings,
    uniqueCourseIds: parsed.uniqueCourseIds,
    duplicateRowsCollapsed: parsed.duplicateRowsCollapsed,
    duplicate179BlocksCollapsed: parsed.duplicate179BlocksCollapsed,
    duplicate189BlocksCollapsed: parsed.duplicate189BlocksCollapsed,
    parsedInstructorAssignments: parsed.parsedInstructorAssignments,
    resolvedInstructorAssignments,
    unresolvedInstructorNames,
    ignoredTbdTbaValues: parsed.ignoredTbdTbaValues,
    matchedCourseIds,
    unmatchedCourseIds,
    rowsInserted,
    rowsUpdated,
    rowsDeactivated,
    displayedSourceUpdateDate: parsed.lastUpdated,
    skippedOrStaleTerms: importable.skippedOrStaleTerms,
    parsingErrors: parsed.parsingErrors,
  } satisfies GlobalStudiesScrapeSummary;
  console.log(JSON.stringify(summary));
  return summary;
}
