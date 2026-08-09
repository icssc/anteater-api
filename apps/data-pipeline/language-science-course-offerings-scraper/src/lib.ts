import type { database } from "@packages/db";
import { and, eq, inArray, ne, notInArray } from "@packages/db/drizzle";
import type { TentativeInstructor, Term } from "@packages/db/schema";
import { calendarTerm, course, instructor, tentativeCourseOffering } from "@packages/db/schema";
import { conflictUpdateSetAllCols } from "@packages/db/utils";
import { type Cheerio, load } from "cheerio";
import type { Element } from "domhandler";

export const LANGUAGE_SCIENCE_COURSE_OFFERINGS_SOURCE = "LANGUAGE_SCIENCE_COURSE_OFFERINGS";
export const LANGUAGE_SCIENCE_COURSE_OFFERINGS_URL =
  "https://www.langsci.uci.edu/undergrad/courses.php";

// The page also contains Summer and historical schedules.  This source intentionally imports
// only the explicit Fall 2026, Winter 2027, and Spring 2027 sections.
const INCLUDED_QUARTERS = ["Fall", "Winter", "Spring"] as const;
type IncludedQuarter = (typeof INCLUDED_QUARTERS)[number];
const CURRENT_HEADERS = new Set(["Fall 2026", "Winter 2027", "Spring 2027"]);

export type ParsedLanguageScienceTerm = {
  header: string;
  academicYear: string;
  year: string;
  quarter: IncludedQuarter;
};

export type ParsedLanguageScienceCourseOffering = Omit<ParsedLanguageScienceTerm, "header"> & {
  courseId: string;
  instructors: string[];
};

export type ParsedLanguageScienceCourseOfferingsPage = {
  sourceTableRows: number;
  normalizedRows: number;
  scheduleSectionsDiscovered: number;
  offeringsByQuarter: Record<IncludedQuarter, number>;
  duplicateRowsCollapsedByQuarter: Record<IncludedQuarter, number>;
  parsedInstructorAssignments: number;
  ignoredInstructorPlaceholders: number;
  offerings: ParsedLanguageScienceCourseOffering[];
  terms: ParsedLanguageScienceTerm[];
  courseIds: string[];
  academicYear: string | null;
  lastUpdated: Date | null;
  displayedUpdateValue: string | null;
  parsingErrors: string[];
};

export type LanguageScienceScrapeSummary = {
  sourceTableRows: number;
  normalizedRows: number;
  scheduleSectionsDiscovered: number;
  offeringsByQuarter: Record<IncludedQuarter, number>;
  uniqueOfferings: number;
  uniqueCourseIds: number;
  duplicateRowsCollapsedByQuarter: Record<IncludedQuarter, number>;
  parsedInstructorAssignments: number;
  resolvedInstructorAssignments: number;
  unresolvedInstructorNames: string[];
  ignoredInstructorPlaceholders: number;
  matchedCourseIds: string[];
  unmatchedCourseIds: string[];
  rowsInserted: number;
  rowsUpdated: number;
  rowsDeactivated: number;
  displayedSourceUpdateDate: Date | null;
  displayedUpdateValue: string | null;
  skippedOrStaleTerms: string[];
  parsingErrors: string[];
};

type CalendarTermForImport = { year: string; quarter: Term; instructionStart: Date };
type ImportScope = Omit<ParsedLanguageScienceTerm, "header">;
type KnownInstructor = { ucinetid: string; name: string; department: string };
type InstructorParseResult = { names: string[]; placeholders: number };

const normalizeWhitespace = (value: string) =>
  value
    .normalize("NFKC")
    .replaceAll(/[\u200B-\u200D\u2060\uFEFF]/g, "")
    .replaceAll(/[\s\p{Z}]+/gu, " ")
    .trim();

export const normalizeLanguageScienceText = (value: string) => normalizeWhitespace(value);
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

function emptyQuarterCounts(): Record<IncludedQuarter, number> {
  return { Fall: 0, Winter: 0, Spring: 0 };
}

/** Normalize only a leading Language Science course identifier; cross-listed IDs are ignored. */
export function normalizeLanguageScienceCourseId(sourceCourseId: string): string | null {
  const value = normalizeWhitespace(sourceCourseId).toUpperCase();
  const match = value.match(/^LSCI\s+(H?\d+[A-Z]*)\b/);
  if (!match) return null;
  const number = match[1].match(/^(H?)(\d+)([A-Z]*)$/);
  if (!number) return null;
  return `LSCI${number[1]}${Number.parseInt(number[2], 10)}${number[3]}`;
}

export function parseLanguageScienceAcademicYear(html: string): {
  academicYear: string;
  startYear: number;
} | null {
  const $ = load(html);
  const currentHeadings = $("p,h1,h2,h3,h4,h5,h6")
    .toArray()
    .map((element) => normalizeWhitespace($(element).text()))
    .filter((value) => /^(?:Fall 2026|Winter 2027|Spring 2027)\s+Course Offerings\b/i.test(value));
  if (currentHeadings.length === 0) return null;
  const explicit = currentHeadings
    .map((value) => value.match(/\b(20\d{2})\s*[-–—]\s*(20\d{2})\b/))
    .find(Boolean);
  if (explicit) {
    const startYear = Number.parseInt(explicit[1], 10);
    const endYear = Number.parseInt(explicit[2], 10);
    if (endYear !== startYear + 1) return null;
    return { academicYear: academicYearLabel(startYear), startYear };
  }
  if (currentHeadings.some((h) => /^Fall 2026\b/i.test(h)))
    return { academicYear: "2026-2027", startYear: 2026 };
  return null;
}

export function parseLanguageScienceTermHeader(
  value: string,
  academicYear: string,
  startYear: number,
): ParsedLanguageScienceTerm | null {
  const header = normalizeWhitespace(value);
  const match = header.match(/^(Fall|Winter|Spring)\s+(20\d{2})\s+Course Offerings\b/i);
  if (!match) return null;
  const quarter =
    `${match[1][0].toUpperCase()}${match[1].slice(1).toLowerCase()}` as IncludedQuarter;
  const year = Number.parseInt(match[2], 10);
  const expectedYear = quarter === "Fall" ? startYear : startYear + 1;
  if (year !== expectedYear) return null;
  return { header, academicYear, year: year.toString(10), quarter };
}

function sectionHeadingElements($: ReturnType<typeof load>): Element[] {
  return $("p,h1,h2,h3,h4,h5,h6")
    .toArray()
    .filter((element) => {
      const text = normalizeWhitespace($(element).text());
      return /^(Fall|Winter|Spring|Summer)\s+20\d{2}\s+Course Offerings\b/i.test(text);
    });
}

function findSectionTable($: ReturnType<typeof load>, heading: Element): Cheerio<Element> | null {
  let sibling = $(heading).next();
  while (sibling.length > 0) {
    const element = sibling[0];
    if (element.type === "tag" && element.name === "table") return sibling;
    if (
      element.type === "tag" &&
      /^(p|h[1-6])$/i.test(element.name) &&
      /^(Fall|Winter|Spring|Summer)\s+20\d{2}\s+Course Offerings\b/i.test(
        normalizeWhitespace(sibling.text()),
      )
    )
      break;
    sibling = sibling.next();
  }
  return null;
}

function parseInstructorValues(value: string): InstructorParseResult {
  const names: string[] = [];
  let placeholders = 0;
  for (const match of value.matchAll(/\(([^()]*)\)/g)) {
    const candidate = normalizeWhitespace(match[1]);
    if (/^(?:staff|tba|tbd|instructor\s+tba)$/i.test(candidate)) {
      names.push("TBD");
      placeholders += 1;
      continue;
    }
    // The page has no instructor column.  Parenthetical surname/initial values are the only
    // clearly associated person fields; parenthetical cross-list and GE notes are ignored.
    if (
      /^[\p{Lu}]/u.test(candidate) &&
      /,\s*[\p{Lu}]/u.test(candidate) &&
      /^[\p{L}][\p{L}'’.-]*(?:\s+[\p{L}][\p{L}'’.-]+)*,\s*[\p{L}][\p{L}'’.-]*(?:\s+[\p{L}][\p{L}'’.-]*)*$/u.test(
        candidate,
      )
    )
      names.push(candidate);
  }
  return { names: Array.from(new Set(names)), placeholders };
}

export function parseLanguageScienceCourseOfferings(
  html: string,
): ParsedLanguageScienceCourseOfferingsPage {
  const $ = load(html);
  const academic = parseLanguageScienceAcademicYear(html);
  const parsingErrors: string[] = [];
  if (!academic)
    parsingErrors.push("Language Science listing is missing a valid 2026-2027 schedule heading");

  const headings = sectionHeadingElements($);
  const current = headings.filter((heading) => {
    const headingText = normalizeWhitespace($(heading).text());
    return Array.from(CURRENT_HEADERS).some((header) =>
      headingText.toLocaleLowerCase().startsWith(`${header.toLocaleLowerCase()} course offerings`),
    );
  });
  const discovered = new Map<
    IncludedQuarter,
    { heading: Element; term: ParsedLanguageScienceTerm }
  >();
  for (const heading of current) {
    const term = academic
      ? parseLanguageScienceTermHeader($(heading).text(), academic.academicYear, academic.startYear)
      : null;
    if (!term) {
      parsingErrors.push(
        `Language Science listing has an invalid current section heading '${normalizeWhitespace($(heading).text())}'`,
      );
      continue;
    }
    if (discovered.has(term.quarter)) {
      parsingErrors.push(`Language Science listing has duplicate ${term.quarter} sections`);
      continue;
    }
    discovered.set(term.quarter, { heading, term });
  }

  const offeringsByQuarter = emptyQuarterCounts();
  const duplicateRowsCollapsedByQuarter = emptyQuarterCounts();
  const offerings = new Map<string, ParsedLanguageScienceCourseOffering>();
  const courseIds = new Set<string>();
  let sourceTableRows = 0;
  let normalizedRows = 0;
  let parsedInstructorAssignments = 0;
  let ignoredInstructorPlaceholders = 0;

  for (const quarter of INCLUDED_QUARTERS) {
    const section = discovered.get(quarter);
    if (!section) {
      parsingErrors.push(`Language Science listing is missing its required ${quarter} section`);
      continue;
    }
    const table = findSectionTable($, section.heading);
    if (!table) {
      parsingErrors.push(`Language Science listing is missing its ${quarter} schedule table`);
      continue;
    }
    const rows = $(table).find("tr").toArray();
    for (const [rowIndex, row] of rows.entries()) {
      const cells = $(row).children("th,td");
      const values = cells.toArray().map((cell) => normalizeWhitespace($(cell).text()));
      if (values.every((value) => value.length === 0)) continue;
      if (/^course number$/i.test(values[0] ?? "")) continue;
      sourceTableRows += 1;
      if (cells.length < 2) {
        parsingErrors.push(
          `Language Science ${quarter} row ${rowIndex + 1} is missing required cells`,
        );
        continue;
      }
      const rawCourse = values[0];
      // ASL and other departments are displayed in these tables but are not Language Science
      // primary offerings. Cross-listed IDs after the slash are deliberately not emitted. The
      // live source's "LLSCI 145A/LPS 105A/PHIL 105A" row begins with the invalid LLSCI typo, so
      // it is reported as malformed instead of guessing an LSCI alias; the resulting parse error
      // intentionally disables cleanup while valid LSCI rows remain safe to upsert.
      if (!/^LSCI\b/i.test(rawCourse)) {
        if (/^LLSCI\b/i.test(rawCourse))
          parsingErrors.push(
            `Language Science ${quarter} row ${rowIndex + 1} has malformed course identifier '${rawCourse}'`,
          );
        continue;
      }
      const courseId = normalizeLanguageScienceCourseId(rawCourse);
      if (!courseId) {
        parsingErrors.push(
          `Language Science ${quarter} row ${rowIndex + 1} has malformed course identifier '${rawCourse}'`,
        );
        continue;
      }
      normalizedRows += 1;
      courseIds.add(courseId);
      const instructorResult = parseInstructorValues(values[1]);
      parsedInstructorAssignments += instructorResult.names.filter((name) => name !== "TBD").length;
      ignoredInstructorPlaceholders += instructorResult.placeholders;
      const offering: ParsedLanguageScienceCourseOffering = {
        academicYear: section.term.academicYear,
        courseId,
        year: section.term.year,
        quarter,
        instructors: instructorResult.names,
      };
      const key = offeringKey(offering);
      const previous = offerings.get(key);
      if (previous) {
        duplicateRowsCollapsedByQuarter[quarter] += 1;
        previous.instructors = Array.from(
          new Set([...previous.instructors, ...offering.instructors]),
        );
      } else {
        offerings.set(key, offering);
        offeringsByQuarter[quarter] += 1;
      }
    }
    if (offeringsByQuarter[quarter] === 0)
      parsingErrors.push(`Language Science listing has no usable ${quarter} offerings`);
  }

  const displayedUpdateMatch = normalizeWhitespace($.root().text()).match(
    /\bLast updated\s*:\s*([^.;\n]+)/i,
  );
  const displayedUpdateValue = displayedUpdateMatch?.[1]?.trim() ?? null;
  let lastUpdated: Date | null = null;
  if (displayedUpdateValue) {
    const exact = displayedUpdateValue.match(
      /^(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2}),\s*(20\d{2})$/i,
    );
    if (exact) {
      const month = [
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
      ].indexOf(exact[1].toLowerCase());
      const day = Number.parseInt(exact[2], 10);
      const year = Number.parseInt(exact[3], 10);
      const parsed = new Date(Date.UTC(year, month, day));
      if (month >= 0 && parsed.getUTCMonth() === month && parsed.getUTCDate() === day)
        lastUpdated = parsed;
      else parsingErrors.push("Could not parse Language Science listing's Last updated value");
    }
  }

  return {
    sourceTableRows,
    normalizedRows,
    scheduleSectionsDiscovered: discovered.size,
    offeringsByQuarter,
    duplicateRowsCollapsedByQuarter,
    parsedInstructorAssignments,
    ignoredInstructorPlaceholders,
    offerings: Array.from(offerings.values()),
    terms: INCLUDED_QUARTERS.flatMap((quarter) => {
      const term = discovered.get(quarter)?.term;
      return term ? [term] : [];
    }),
    courseIds: Array.from(courseIds).toSorted(),
    academicYear: academic?.academicYear ?? null,
    lastUpdated,
    displayedUpdateValue,
    parsingErrors,
  };
}

export function selectImportableLanguageScienceOfferings(
  parsed: ParsedLanguageScienceCourseOfferingsPage,
  calendarTerms: CalendarTermForImport[],
  now: Date,
): {
  offerings: ParsedLanguageScienceCourseOffering[];
  scopes: ImportScope[];
  skippedOrStaleTerms: string[];
} {
  const calendarByTerm = new Map(calendarTerms.map((term) => [termKey(term), term]));
  const scopes = new Map<string, ImportScope>();
  const importable = new Set<string>();
  const skipped = new Set<string>();
  for (const term of parsed.terms) {
    const calendar = calendarByTerm.get(termKey(term));
    if (!calendar) {
      skipped.add(`${term.header} (missing calendar metadata)`);
      continue;
    }
    if (calendar.instructionStart.getTime() <= now.getTime()) {
      skipped.add(`${term.header} (term has begun)`);
      continue;
    }
    importable.add(scopeKey(term));
    scopes.set(scopeKey(term), {
      academicYear: term.academicYear,
      year: term.year,
      quarter: term.quarter,
    });
  }
  return {
    offerings: parsed.offerings.filter((offering) => importable.has(scopeKey(offering))),
    scopes: Array.from(scopes.values()),
    skippedOrStaleTerms: Array.from(skipped),
  };
}

function normalizeInstructorName(value: string): string[] {
  return normalizeWhitespace(value)
    .replace(/[‐‑‒–—―-]/gu, " ")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .toLowerCase()
    .split(" ")
    .filter(Boolean);
}

function instructorMatches(source: string, known: string): boolean {
  const sourceValue = normalizeWhitespace(source);
  const knownValue = normalizeWhitespace(known);
  if (sourceValue.toLowerCase() === knownValue.toLowerCase()) return true;
  if (sourceValue.includes(",")) {
    const [sourceSurname, sourceGiven] = sourceValue
      .split(",", 2)
      .map((part) => normalizeInstructorName(part));
    const knownParts = normalizeInstructorName(knownValue);
    if (sourceSurname.length === 1 && knownParts.includes(sourceSurname[0])) {
      const index = knownParts.indexOf(sourceSurname[0]);
      return (
        sourceGiven.length > 0 &&
        knownParts.some((part, i) => i !== index && part.startsWith(sourceGiven[0][0]))
      );
    }
  }
  const sourceParts = normalizeInstructorName(sourceValue);
  const knownParts = normalizeInstructorName(knownValue);
  return (
    sourceParts.length > 0 &&
    knownParts.length >= sourceParts.length &&
    sourceParts.every((part, i) => part === knownParts[knownParts.length - sourceParts.length + i])
  );
}

export function resolveLanguageScienceInstructors(
  parsedNames: string[],
  known: KnownInstructor[],
): TentativeInstructor[] {
  const resolved: TentativeInstructor[] = [];
  for (const sourceName of Array.from(new Set(parsedNames)).toSorted()) {
    if (sourceName === "TBD") {
      resolved.push({ status: "tbd", name: "TBD", ucinetid: null });
      continue;
    }
    const candidates = known.filter(({ name }) => instructorMatches(sourceName, name));
    const preferred = candidates.filter(({ department }) =>
      /language|linguistic/i.test(department),
    );
    const narrowed = preferred.length > 0 ? preferred : candidates;
    if (narrowed.length === 1)
      resolved.push({ status: "assigned", name: sourceName, ucinetid: narrowed[0].ucinetid });
  }
  return resolved;
}

async function fetchHtml(fetcher: typeof fetch): Promise<string> {
  const response = await fetcher(LANGUAGE_SCIENCE_COURSE_OFFERINGS_URL, {
    headers: { "User-Agent": "Anteater API tentative course offerings scraper" },
  });
  if (!response.ok)
    throw new Error(
      `Failed to fetch ${LANGUAGE_SCIENCE_COURSE_OFFERINGS_URL}: HTTP ${response.status}`,
    );
  return response.text();
}

export async function doScrape(
  db: ReturnType<typeof database>,
  fetcher: typeof fetch = fetch,
  now = new Date(),
): Promise<LanguageScienceScrapeSummary> {
  const parsed = parseLanguageScienceCourseOfferings(await fetchHtml(fetcher));
  if (
    parsed.academicYear === null ||
    parsed.scheduleSectionsDiscovered !== INCLUDED_QUARTERS.length ||
    parsed.terms.length !== INCLUDED_QUARTERS.length ||
    parsed.offerings.length === 0
  )
    throw new Error(
      "Language Science listing did not contain all current undergraduate quarter sections",
    );

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
  const allNames = Array.from(
    new Set(parsed.offerings.flatMap(({ instructors }) => instructors)),
  ).toSorted();
  const unresolvedInstructorNames = allNames.filter(
    (name) =>
      name !== "TBD" && resolveLanguageScienceInstructors([name], knownInstructors).length === 0,
  );
  const importable = selectImportableLanguageScienceOfferings(parsed, calendarTerms, now);
  const values: Array<typeof tentativeCourseOffering.$inferInsert> = importable.offerings
    .filter(({ courseId }) => knownCourseIds.has(courseId))
    .map((offering) => ({
      source: LANGUAGE_SCIENCE_COURSE_OFFERINGS_SOURCE,
      sourceUrl: LANGUAGE_SCIENCE_COURSE_OFFERINGS_URL,
      academicYear: offering.academicYear,
      courseId: offering.courseId,
      year: offering.year,
      quarter: offering.quarter,
      instructors: resolveLanguageScienceInstructors(offering.instructors, knownInstructors),
      lastUpdated: parsed.lastUpdated,
    }));
  if (importable.offerings.length > 0 && values.length === 0)
    throw new Error(
      "Language Science listing did not contain future offerings for known Anteater API courses",
    );

  const scopeKeys = new Set(importable.scopes.map(scopeKey));
  const academicYears = Array.from(
    new Set(importable.scopes.map(({ academicYear }) => academicYear)),
  );
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
              eq(tentativeCourseOffering.source, LANGUAGE_SCIENCE_COURSE_OFFERINGS_SOURCE),
              inArray(tentativeCourseOffering.academicYear, academicYears),
            ),
          )
      : [];
  const relevant = existing.filter((row) => scopeKeys.has(scopeKey(row)));
  const existingKeys = new Set(relevant.map(offeringKey));
  const currentKeys = new Set(values.map(offeringKey));
  const rowsInserted = Array.from(currentKeys).filter((key) => !existingKeys.has(key)).length;
  const rowsUpdated = Array.from(currentKeys).filter((key) => existingKeys.has(key)).length;
  const sourceCurrentKeys = new Set(importable.offerings.map(offeringKey));
  for (const row of relevant)
    if (unmatchedCourseIds.includes(row.courseId)) sourceCurrentKeys.add(offeringKey(row));
  const cleanupEnabled = parsed.parsingErrors.length === 0;
  const rowsDeactivated = cleanupEnabled
    ? Array.from(existingKeys).filter((key) => !sourceCurrentKeys.has(key)).length
    : 0;

  if (importable.scopes.length > 0)
    await db.transaction(async (tx) => {
      for (const scope of importable.scopes) {
        const sourceCourseIds = Array.from(
          new Set([
            ...unmatchedCourseIds,
            ...importable.offerings
              .filter((offering) => scopeKey(offering) === scopeKey(scope))
              .map(({ courseId }) => courseId),
          ]),
        );
        const conditions = and(
          eq(tentativeCourseOffering.source, LANGUAGE_SCIENCE_COURSE_OFFERINGS_SOURCE),
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
    (total, offering) =>
      total +
      resolveLanguageScienceInstructors(offering.instructors, knownInstructors).filter(
        (instructor) => instructor.status === "assigned",
      ).length,
    0,
  );
  const summary: LanguageScienceScrapeSummary = {
    sourceTableRows: parsed.sourceTableRows,
    normalizedRows: parsed.normalizedRows,
    scheduleSectionsDiscovered: parsed.scheduleSectionsDiscovered,
    offeringsByQuarter: parsed.offeringsByQuarter,
    uniqueOfferings: parsed.offerings.length,
    uniqueCourseIds: parsed.courseIds.length,
    duplicateRowsCollapsedByQuarter: parsed.duplicateRowsCollapsedByQuarter,
    parsedInstructorAssignments: parsed.parsedInstructorAssignments,
    resolvedInstructorAssignments,
    unresolvedInstructorNames,
    ignoredInstructorPlaceholders: parsed.ignoredInstructorPlaceholders,
    matchedCourseIds,
    unmatchedCourseIds,
    rowsInserted,
    rowsUpdated,
    rowsDeactivated,
    displayedSourceUpdateDate: parsed.lastUpdated,
    displayedUpdateValue: parsed.displayedUpdateValue,
    skippedOrStaleTerms: importable.skippedOrStaleTerms,
    parsingErrors: parsed.parsingErrors,
  };
  console.log(JSON.stringify(summary));
  return summary;
}
