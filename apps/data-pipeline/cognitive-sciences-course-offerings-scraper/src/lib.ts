import type { database } from "@packages/db";
import { and, eq, inArray, ne, notInArray } from "@packages/db/drizzle";
import type { TentativeInstructor, Term } from "@packages/db/schema";
import { calendarTerm, course, instructor, tentativeCourseOffering } from "@packages/db/schema";
import { conflictUpdateSetAllCols } from "@packages/db/utils";
import { type CheerioAPI, load } from "cheerio";

export const COGNITIVE_SCIENCES_COURSE_OFFERINGS_SOURCE = "COGNITIVE_SCIENCES_COURSE_OFFERINGS";
export const COGNITIVE_SCIENCES_COURSE_OFFERINGS_URL = "https://www.cogsci.uci.edu/undergraduate/";

// The source page has no structured Summer table; this integration intentionally imports
// only the three academic-year terms named by the page.
const INCLUDED_QUARTERS = ["Fall", "Winter", "Spring"] as const;
type IncludedQuarter = (typeof INCLUDED_QUARTERS)[number];
const EXPECTED_YEARS = {
  Fall: "2026",
  Winter: "2027",
  Spring: "2027",
} as const;

export type ParsedCognitiveTerm = {
  header: string;
  academicYear: string;
  year: string;
  quarter: IncludedQuarter;
};

export type ParsedCognitiveInstructor = {
  name: string;
  isPlaceholder: boolean;
};

export type ParsedCognitiveCourseOffering = Omit<ParsedCognitiveTerm, "header"> & {
  courseId: string;
  instructors: ParsedCognitiveInstructor[];
};

export type ParsedCognitiveCourseOfferingsPage = {
  academicYear: string;
  lastUpdated: null;
  terms: ParsedCognitiveTerm[];
  sourceTableRows: number;
  normalizedCourseRows: number;
  expandedCourseRows: number;
  expandedLectureLabOfferings: number;
  offeringsByQuarter: Record<IncludedQuarter, number>;
  offerings: ParsedCognitiveCourseOffering[];
  courseIds: string[];
  duplicateRowsCollapsed: number;
  duplicateCogs189RowsCollapsed: number;
  crossListedNonCogsIdsIgnored: string[];
  renumberingNotesObserved: string[];
  parsedInstructorAssignments: number;
  ignoredPlaceholderAssignments: number;
  ignoredPlaceholderValues: string[];
  ignoredStaffValues: string[];
  ignoredOfferedByValues: string[];
  parsingErrors: string[];
};

export type CognitiveSciencesScrapeSummary = {
  sourceTableRows: number;
  normalizedCourseRows: number;
  expandedCourseRows: number;
  expandedLectureLabOfferings: number;
  offeringsByQuarter: Record<IncludedQuarter, number>;
  uniqueOfferings: number;
  uniqueCourseIds: number;
  duplicateRowsCollapsed: number;
  duplicateCogs189RowsCollapsed: number;
  crossListedNonCogsIdsIgnored: string[];
  renumberingNotesObserved: string[];
  parsedInstructorAssignments: number;
  ignoredPlaceholderAssignments: number;
  resolvedInstructorAssignments: number;
  unresolvedInstructorAssignments: number;
  unresolvedInstructorNames: string[];
  ignoredPlaceholderValues: string[];
  ignoredStaffValues: string[];
  ignoredOfferedByValues: string[];
  matchedCourseIds: string[];
  unmatchedCourseIds: string[];
  rowsInserted: number;
  rowsUpdated: number;
  rowsDeactivated: number;
  skippedOrStaleTerms: string[];
  parsingErrors: string[];
};

type KnownInstructor = { ucinetid: string; name: string };
type CalendarTermForImport = {
  year: string;
  quarter: Term;
  instructionStart: Date;
};
type ImportScope = Omit<ParsedCognitiveTerm, "header">;

const normalizeWhitespace = (value: string) =>
  value
    .normalize("NFKC")
    .replaceAll(/[\u200B-\u200D\u2060\uFEFF]/g, "")
    .replaceAll(/[\s\p{Z}]+/gu, " ")
    .trim();

const normalizeName = (value: string) =>
  normalizeWhitespace(value).toLocaleLowerCase().replaceAll(/[.,]/g, "").replaceAll(/\s+/g, " ");

const termKey = (term: { year: string; quarter: string }) => `${term.year} ${term.quarter}`;
const scopeKey = (term: { academicYear: string; year: string; quarter: string }) =>
  `${term.academicYear}|${termKey(term)}`;
const offeringKey = (offering: {
  academicYear: string;
  courseId: string;
  year: string;
  quarter: string;
}) => `${scopeKey(offering)}|${offering.courseId}`;
const academicYearLabel = "2026-2027";

function emptyOfferingCounts(): Record<IncludedQuarter, number> {
  return { Fall: 0, Winter: 0, Spring: 0 };
}

export function normalizeCognitiveSciencesText(value: string): string {
  return normalizeWhitespace(value);
}

/** Normalize only a leading COGS identifier; notes and cross-listed departments are metadata. */
export function normalizeCognitiveSciencesCourseId(sourceCourseId: string): string | null {
  const match = normalizeWhitespace(sourceCourseId.toUpperCase()).match(/\bCOGS\s+(H?\d+[A-Z]*)\b/);
  if (!match) return null;
  const code = match[1];
  const parts = code.match(/^(H?)(\d+)([A-Z]*)$/);
  if (!parts) return null;
  const number = Number.parseInt(parts[2], 10);
  if (!Number.isInteger(number)) return null;
  return `COGS${parts[1]}${number}${parts[3]}`;
}

function extractCognitiveCourseIds(value: string): {
  ids: string[];
  crossListed: string[];
} {
  const normalized = normalizeWhitespace(value.toUpperCase());
  const first = normalizeCognitiveSciencesCourseId(normalized);
  if (!first) return { ids: [], crossListed: [] };

  const firstMatch = normalized.match(/\bCOGS\s+(H?\d+[A-Z]*)\b/);
  if (!firstMatch) return { ids: [first], crossListed: [] };
  const baseCode = firstMatch[1];
  const baseParts = baseCode.match(/^(H?)(\d+)([A-Z]*)$/);
  if (!baseParts) return { ids: [first], crossListed: [] };
  const rest = normalized.slice((firstMatch.index ?? 0) + firstMatch[0].length);

  // COGS 112E/LE and COGS 112N-LN are one source row naming a lecture and its lab.
  const shorthand = rest.match(/^\s*(?:\/|-)\s*([A-Z]{1,3})\b/);
  if (shorthand && /^L[A-Z]{1,2}$/.test(shorthand[1])) {
    const suffix = shorthand[1];
    const labId = `COGS${baseParts[1]}${baseParts[2]}${suffix}`;
    if (labId !== first) return { ids: [first, labId], crossListed: [] };
  }

  const crossListed = rest.match(/^\s*\/\s*([^\s/]+)/)?.[1];
  return { ids: [first], crossListed: crossListed ? [crossListed] : [] };
}

export function extractCognitiveSciencesCourseIds(value: string): string[] {
  return extractCognitiveCourseIds(value).ids;
}

export function parseCognitiveAcademicYear(html: string): string {
  const text = normalizeWhitespace(load(html).text());
  const match = text.match(/planned for the\s+(20\d{2})[-–—](\d{2}|20\d{2})\s*AY/i);
  if (!match) throw new Error("Cognitive Sciences page did not contain a valid academic year");
  const end =
    match[2].length === 2 ? Number(`${match[1].slice(0, 2)}${match[2]}`) : Number(match[2]);
  if (end !== Number(match[1]) + 1)
    throw new Error("Cognitive Sciences academic year is not consecutive");
  return `${match[1]}-${end}`;
}

export function parseCognitiveTermHeader(value: string): ParsedCognitiveTerm | null {
  const header = normalizeWhitespace(value).toUpperCase();
  const match = header.match(/^(FALL|WINTER|SPRING)\s+(20\d{2})\s+COURSES:?$/);
  if (!match) return null;
  const quarter = `${match[1][0]}${match[1].slice(1).toLocaleLowerCase()}` as IncludedQuarter;
  if (match[2] !== EXPECTED_YEARS[quarter]) return null;
  return {
    header: `${quarter.toUpperCase()} ${match[2]} COURSES:`,
    academicYear: academicYearLabel,
    year: match[2],
    quarter,
  };
}

function isPlaceholderInstructor(value: string): boolean {
  return /^(staff|tba|tbd)$/i.test(value) || /^offered by\b/i.test(value);
}

function parseInstructorNames(value: string): string[] {
  const normalized = normalizeWhitespace(value);
  if (!normalized) return [];
  return normalized
    .split(/\s*(?:;|\n|\band\b)\s*/i)
    .map((name) => normalizeWhitespace(name))
    .filter(Boolean);
}

function findCourseOfferingsRoot($: CheerioAPI) {
  const headings = $("h3, h2, h1")
    .toArray()
    .filter(
      (element) => normalizeWhitespace($(element).text()).toUpperCase() === "COURSE OFFERINGS",
    );
  return headings.find((heading) => {
    const parent = $(heading).parent();
    return parent
      .find("p, strong")
      .toArray()
      .some((element) => parseCognitiveTermHeader($(element).text()) !== null);
  });
}

function tableHeaders($: CheerioAPI, table: Parameters<CheerioAPI>[0]): string[] {
  return $(table)
    .find("thead tr")
    .first()
    .find("th, td")
    .toArray()
    .map((cell) => normalizeWhitespace($(cell).text()));
}

function cellText($: CheerioAPI, cell: Parameters<CheerioAPI>[0]): string {
  const cloned = $(cell).clone();
  cloned.find("br").replaceWith(" ");
  return normalizeWhitespace(cloned.text());
}

function findTermTables($: CheerioAPI, root: Parameters<CheerioAPI>[0], parsingErrors: string[]) {
  const parent = $(root).parent();
  const terms = new Map<
    IncludedQuarter,
    { term: ParsedCognitiveTerm; table: Parameters<CheerioAPI>[0] }
  >();
  const markers = parent
    .children("p")
    .toArray()
    .filter((element) => parseCognitiveTermHeader($(element).text()) !== null);
  for (const marker of markers) {
    const term = parseCognitiveTermHeader($(marker).text());
    if (!term) continue;
    const nextMarkerIndex = markers.indexOf(marker);
    const next = markers[nextMarkerIndex + 1];
    const siblings = $(marker).nextAll().toArray();
    const nextRequiredMarkerIndex = next ? siblings.indexOf(next) : siblings.length;
    const sectionBoundaryIndex = siblings.findIndex(
      (sibling) =>
        $(sibling).is("hr") ||
        ($(sibling).is("p") &&
          /^(?:FALL|WINTER|SPRING|SUMMER)\s+20\d{2}\s+COURSES:?$/i.test(
            normalizeWhitespace($(sibling).text()),
          )),
    );
    const endIndex =
      sectionBoundaryIndex >= 0
        ? Math.min(nextRequiredMarkerIndex, sectionBoundaryIndex)
        : nextRequiredMarkerIndex;
    const beforeNext = siblings.slice(0, endIndex);
    const candidates = beforeNext
      .flatMap((sibling) =>
        $(sibling).is("table") ? [sibling] : $(sibling).find("table").toArray(),
      )
      .filter((table) => {
        const labels = tableHeaders($, table).map((header) => header.toLocaleLowerCase());
        return (
          labels.includes("course number") &&
          labels.includes("course title") &&
          labels.includes("instructor")
        );
      });
    if (candidates.length !== 1) {
      parsingErrors.push(
        `Cognitive Sciences ${term.quarter} section has ${candidates.length} qualifying tables`,
      );
      continue;
    }
    if (terms.has(term.quarter))
      parsingErrors.push(`Cognitive Sciences has duplicate ${term.quarter} sections`);
    else terms.set(term.quarter, { term, table: candidates[0] });
  }
  for (const quarter of INCLUDED_QUARTERS) {
    if (!terms.has(quarter))
      parsingErrors.push(`Cognitive Sciences listing is missing its ${quarter} section`);
  }
  return terms;
}

export function parseCognitiveSciencesCourseOfferings(
  html: string,
): ParsedCognitiveCourseOfferingsPage {
  const $ = load(html);
  const parsingErrors: string[] = [];
  let academicYear = academicYearLabel;
  try {
    academicYear = parseCognitiveAcademicYear(html);
  } catch (error) {
    parsingErrors.push(error instanceof Error ? error.message : String(error));
  }
  const root = findCourseOfferingsRoot($);
  if (!root) {
    parsingErrors.push("Cognitive Sciences listing is missing its COURSE OFFERINGS section");
    return {
      academicYear,
      lastUpdated: null,
      terms: [],
      sourceTableRows: 0,
      normalizedCourseRows: 0,
      expandedCourseRows: 0,
      expandedLectureLabOfferings: 0,
      offeringsByQuarter: emptyOfferingCounts(),
      offerings: [],
      courseIds: [],
      duplicateRowsCollapsed: 0,
      duplicateCogs189RowsCollapsed: 0,
      crossListedNonCogsIdsIgnored: [],
      renumberingNotesObserved: [],
      parsedInstructorAssignments: 0,
      ignoredPlaceholderAssignments: 0,
      ignoredPlaceholderValues: [],
      ignoredStaffValues: [],
      ignoredOfferedByValues: [],
      parsingErrors,
    };
  }

  const termTables = findTermTables($, root, parsingErrors);
  const terms = INCLUDED_QUARTERS.flatMap((quarter) => termTables.get(quarter)?.term ?? []);
  const offerings = new Map<string, ParsedCognitiveCourseOffering>();
  const courseIds = new Set<string>();
  const offeringsByQuarter = emptyOfferingCounts();
  const crossListedNonCogsIds = new Set<string>();
  const renumberingNotesObserved = new Set<string>();
  const ignoredPlaceholderValues = new Set<string>();
  const ignoredStaffValues = new Set<string>();
  const ignoredOfferedByValues = new Set<string>();
  let sourceTableRows = 0;
  let normalizedCourseRows = 0;
  let expandedCourseRows = 0;
  let expandedLectureLabOfferings = 0;
  let duplicateRowsCollapsed = 0;
  let duplicateCogs189RowsCollapsed = 0;
  let parsedInstructorAssignments = 0;
  let ignoredPlaceholderAssignments = 0;

  for (const quarter of INCLUDED_QUARTERS) {
    const entry = termTables.get(quarter);
    if (!entry) continue;
    const headers = tableHeaders($, entry.table).map((header) => header.toLocaleLowerCase());
    const headerIndices = {
      courseNumber: headers.indexOf("course number"),
      title: headers.indexOf("course title"),
      instructor: headers.indexOf("instructor"),
    };
    for (const [rowIndex, row] of $(entry.table).find("tbody tr").toArray().entries()) {
      const cells = $(row).children("th, td");
      const values = cells.toArray().map((cell) => cellText($, cell));
      if (values.every((value) => value.length === 0)) continue;
      sourceTableRows += 1;
      const labelled = new Map<string, string>();
      cells.each((_, cell) => {
        const label = $(cell).attr("data-label");
        if (label) labelled.set(normalizeWhitespace(label).toLocaleLowerCase(), cellText($, cell));
      });
      const sourceCourseNumber =
        labelled.get("course number") ?? values[headerIndices.courseNumber] ?? "";
      const title = labelled.get("course title") ?? values[headerIndices.title] ?? "";
      const instructorText = labelled.get("instructor") ?? values[headerIndices.instructor] ?? "";
      if (!sourceCourseNumber.trim()) {
        parsingErrors.push(
          `Cognitive Sciences ${quarter} row ${rowIndex + 1} has no course identifier`,
        );
        continue;
      }
      const extracted = extractCognitiveCourseIds(sourceCourseNumber);
      if (extracted.ids.length === 0) {
        parsingErrors.push(
          `Cognitive Sciences ${quarter} row ${rowIndex + 1} has no valid COGS identifier '${sourceCourseNumber}'`,
        );
        continue;
      }
      normalizedCourseRows += 1;
      if (extracted.ids.length > 1) {
        expandedLectureLabOfferings += extracted.ids.length - 1;
        expandedCourseRows += extracted.ids.length;
      } else expandedCourseRows += 1;
      for (const ignored of extracted.crossListed) crossListedNonCogsIds.add(ignored);
      if (/\b(?:formerly|previously|renumbering)\b/i.test(sourceCourseNumber))
        renumberingNotesObserved.add(sourceCourseNumber);

      const instructorNames = parseInstructorNames(instructorText);
      const instructors: ParsedCognitiveInstructor[] = [];
      for (const name of instructorNames) {
        if (isPlaceholderInstructor(name)) {
          ignoredPlaceholderAssignments += 1;
          ignoredPlaceholderValues.add(name);
          if (/^staff$/i.test(name)) ignoredStaffValues.add(name);
          if (/^offered by\b/i.test(name)) ignoredOfferedByValues.add(name);
          continue;
        }
        parsedInstructorAssignments += 1;
        instructors.push({ name, isPlaceholder: false });
      }

      for (const courseId of extracted.ids) {
        courseIds.add(courseId);
        const offering: ParsedCognitiveCourseOffering = {
          academicYear,
          courseId,
          year: entry.term.year,
          quarter,
          instructors,
        };
        const key = offeringKey(offering);
        const existing = offerings.get(key);
        if (existing) {
          duplicateRowsCollapsed += 1;
          if (courseId === "COGS189") duplicateCogs189RowsCollapsed += 1;
          existing.instructors = Array.from(
            new Map(
              [...existing.instructors, ...instructors].map((item) => [item.name, item]),
            ).values(),
          );
        } else {
          offerings.set(key, offering);
          offeringsByQuarter[quarter] += 1;
        }
      }
      void title;
    }
    if (offeringsByQuarter[quarter] === 0)
      parsingErrors.push(`Cognitive Sciences ${quarter} section has no usable offerings`);
  }

  return {
    academicYear,
    lastUpdated: null,
    terms,
    sourceTableRows,
    normalizedCourseRows,
    expandedCourseRows,
    expandedLectureLabOfferings,
    offeringsByQuarter,
    offerings: Array.from(offerings.values()),
    courseIds: Array.from(courseIds).toSorted(),
    duplicateRowsCollapsed,
    duplicateCogs189RowsCollapsed,
    crossListedNonCogsIdsIgnored: Array.from(crossListedNonCogsIds).toSorted(),
    renumberingNotesObserved: Array.from(renumberingNotesObserved).toSorted(),
    parsedInstructorAssignments,
    ignoredPlaceholderAssignments,
    ignoredPlaceholderValues: Array.from(ignoredPlaceholderValues).toSorted(),
    ignoredStaffValues: Array.from(ignoredStaffValues).toSorted(),
    ignoredOfferedByValues: Array.from(ignoredOfferedByValues).toSorted(),
    parsingErrors,
  };
}

function instructorMatches(sourceName: string, knownName: string): boolean {
  const source = normalizeName(sourceName);
  const known = normalizeName(knownName);
  if (source === known) return true;
  const sourceParts = source.split(" ");
  const knownParts = known.split(" ");
  return sourceParts.length === 1 && knownParts.includes(source);
}

export function resolveCognitiveInstructors(
  parsed: ParsedCognitiveInstructor[],
  knownInstructors: KnownInstructor[],
): {
  instructors: TentativeInstructor[];
  unresolvedNames: string[];
  resolvedCount: number;
} {
  const resolved: TentativeInstructor[] = [];
  const unresolvedNames = new Set<string>();
  for (const candidate of parsed) {
    const matches = knownInstructors.filter((known) =>
      instructorMatches(candidate.name, known.name),
    );
    if (matches.length === 1) {
      resolved.push({
        status: "assigned",
        name: matches[0].name,
        ucinetid: matches[0].ucinetid,
      });
    } else unresolvedNames.add(candidate.name);
  }
  return {
    instructors: resolved.filter(
      (value, index, all) =>
        all.findIndex((other) => other.name === value.name && other.ucinetid === value.ucinetid) ===
        index,
    ),
    unresolvedNames: Array.from(unresolvedNames).toSorted(),
    resolvedCount: resolved.length,
  };
}

export function selectImportableCognitiveOfferings(
  parsed: ParsedCognitiveCourseOfferingsPage,
  calendarTerms: CalendarTermForImport[],
  now: Date,
) {
  const calendarByTerm = new Map(calendarTerms.map((term) => [termKey(term), term]));
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
  const response = await fetcher(COGNITIVE_SCIENCES_COURSE_OFFERINGS_URL, {
    headers: {
      "User-Agent": "Anteater API tentative course offerings scraper",
    },
  });
  if (!response.ok)
    throw new Error(
      `Failed to fetch ${COGNITIVE_SCIENCES_COURSE_OFFERINGS_URL}: HTTP ${response.status}`,
    );
  return await response.text();
}

export async function doScrape(
  db: ReturnType<typeof database>,
  fetcher: typeof fetch = fetch,
  now = new Date(),
): Promise<CognitiveSciencesScrapeSummary> {
  const parsed = parseCognitiveSciencesCourseOfferings(await fetchHtml(fetcher));
  if (
    parsed.parsingErrors.length > 0 ||
    parsed.terms.length !== INCLUDED_QUARTERS.length ||
    parsed.offerings.length === 0
  ) {
    throw new Error(
      "Cognitive Sciences listing did not contain a structurally valid tentative-offerings page",
    );
  }
  const sourceYears = Array.from(new Set(parsed.terms.map(({ year }) => year)));
  const [knownCourses, knownInstructors, calendarTerms] = await Promise.all([
    db.select({ id: course.id }).from(course).where(inArray(course.id, parsed.courseIds)),
    db
      .select({ ucinetid: instructor.ucinetid, name: instructor.name })
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
  const importable = selectImportableCognitiveOfferings(parsed, calendarTerms, now);
  const resolvedByKey = new Map<string, ReturnType<typeof resolveCognitiveInstructors>>();
  const values: Array<typeof tentativeCourseOffering.$inferInsert> = [];
  for (const offering of importable.offerings) {
    if (!knownCourseIds.has(offering.courseId)) continue;
    const resolved = resolveCognitiveInstructors(offering.instructors, knownInstructors);
    resolvedByKey.set(offeringKey(offering), resolved);
    values.push({
      source: COGNITIVE_SCIENCES_COURSE_OFFERINGS_SOURCE,
      sourceUrl: COGNITIVE_SCIENCES_COURSE_OFFERINGS_URL,
      academicYear: offering.academicYear,
      courseId: offering.courseId,
      year: offering.year,
      quarter: offering.quarter as Term,
      instructors: resolved.instructors,
      lastUpdated: null,
    });
  }
  if (importable.offerings.length > 0 && values.length === 0)
    throw new Error(
      "Cognitive Sciences listing did not contain offerings for any known Anteater API courses",
    );

  const scopeKeys = new Set(importable.scopes.map(scopeKey));
  const existingRows =
    importable.scopes.length > 0
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
              eq(tentativeCourseOffering.source, COGNITIVE_SCIENCES_COURSE_OFFERINGS_SOURCE),
              inArray(
                tentativeCourseOffering.academicYear,
                Array.from(new Set(importable.scopes.map(({ academicYear }) => academicYear))),
              ),
            ),
          )
      : [];
  const relevantExistingRows = existingRows.filter((row) => scopeKeys.has(scopeKey(row)));
  const existingKeys = new Set(relevantExistingRows.map((row) => offeringKey(row)));
  const currentKeys = new Set(values.map((value) => offeringKey(value)));
  const rowsInserted = Array.from(currentKeys).filter((key) => !existingKeys.has(key)).length;
  const rowsUpdated = Array.from(currentKeys).filter((key) => existingKeys.has(key)).length;
  const sourceCurrentKeys = new Set(importable.offerings.map(offeringKey));
  const cleanupEnabled =
    parsed.parsingErrors.length === 0 &&
    importable.scopes.length > 0 &&
    importable.offerings.length > 0;
  const rowsDeactivated = cleanupEnabled
    ? Array.from(existingKeys).filter((key) => !sourceCurrentKeys.has(key)).length
    : 0;
  const unresolvedInstructorNames = Array.from(
    new Set(
      parsed.offerings.flatMap(
        (offering) =>
          resolveCognitiveInstructors(offering.instructors, knownInstructors).unresolvedNames,
      ),
    ),
  ).toSorted();
  const unresolvedInstructorAssignments = unresolvedInstructorNames.length;
  const resolvedInstructorAssignments = Array.from(resolvedByKey.values()).reduce(
    (total, value) => total + value.resolvedCount,
    0,
  );

  await db.transaction(async (tx) => {
    if (cleanupEnabled) {
      for (const scope of importable.scopes) {
        const protectedCourseIds = Array.from(
          new Set(
            importable.offerings
              .filter((offering) => scopeKey(offering) === scopeKey(scope))
              .map(({ courseId }) => courseId),
          ),
        );
        const conditions = and(
          eq(tentativeCourseOffering.source, COGNITIVE_SCIENCES_COURSE_OFFERINGS_SOURCE),
          eq(tentativeCourseOffering.academicYear, scope.academicYear),
          eq(tentativeCourseOffering.year, scope.year),
          eq(tentativeCourseOffering.quarter, scope.quarter),
        );
        await tx
          .delete(tentativeCourseOffering)
          .where(
            protectedCourseIds.length > 0
              ? and(conditions, notInArray(tentativeCourseOffering.courseId, protectedCourseIds))
              : conditions,
          );
      }
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
  const summary: CognitiveSciencesScrapeSummary = {
    sourceTableRows: parsed.sourceTableRows,
    normalizedCourseRows: parsed.normalizedCourseRows,
    expandedCourseRows: parsed.expandedCourseRows,
    expandedLectureLabOfferings: parsed.expandedLectureLabOfferings,
    offeringsByQuarter: parsed.offeringsByQuarter,
    uniqueOfferings: parsed.offerings.length,
    uniqueCourseIds: parsed.courseIds.length,
    duplicateRowsCollapsed: parsed.duplicateRowsCollapsed,
    duplicateCogs189RowsCollapsed: parsed.duplicateCogs189RowsCollapsed,
    crossListedNonCogsIdsIgnored: parsed.crossListedNonCogsIdsIgnored,
    renumberingNotesObserved: parsed.renumberingNotesObserved,
    parsedInstructorAssignments: parsed.parsedInstructorAssignments,
    ignoredPlaceholderAssignments: parsed.ignoredPlaceholderAssignments,
    resolvedInstructorAssignments,
    unresolvedInstructorAssignments,
    unresolvedInstructorNames,
    ignoredPlaceholderValues: parsed.ignoredPlaceholderValues,
    ignoredStaffValues: parsed.ignoredStaffValues,
    ignoredOfferedByValues: parsed.ignoredOfferedByValues,
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
