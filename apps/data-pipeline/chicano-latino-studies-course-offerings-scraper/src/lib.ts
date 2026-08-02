import type { database } from "@packages/db";
import { and, eq, inArray, ne, notInArray } from "@packages/db/drizzle";
import type { TentativeInstructor, Term } from "@packages/db/schema";
import { calendarTerm, course, instructor, tentativeCourseOffering } from "@packages/db/schema";
import { conflictUpdateSetAllCols } from "@packages/db/utils";
import { type Cheerio, load } from "cheerio";
import type { Element } from "domhandler";

export const CHICANO_LATINO_STUDIES_COURSE_OFFERINGS_SOURCE =
  "CHICANO_LATINO_STUDIES_COURSE_OFFERINGS";
export const CHICANO_LATINO_STUDIES_COURSE_OFFERINGS_URL =
  "https://www.chicanolatinostudies.uci.edu/undergrad/courses.php";

// The undergraduate source publishes only these three quarter tables; no Summer offering is inferred.
const INCLUDED_QUARTERS = ["Fall", "Winter", "Spring"] as const;
type IncludedQuarter = (typeof INCLUDED_QUARTERS)[number];

type KnownInstructor = {
  ucinetid: string;
  name: string;
  department: string;
};

export type ParsedChicanoLatinoTerm = {
  header: string;
  academicYear: string;
  year: string;
  quarter: IncludedQuarter;
};

export type ParsedChicanoLatinoCourseOffering = Omit<ParsedChicanoLatinoTerm, "header"> & {
  courseId: string;
  instructors: string[];
};

export type ParsedChicanoLatinoCourseOfferingsPage = {
  sourceRowsByQuarter: Record<IncludedQuarter, number>;
  normalizedRows: number;
  offeringsByQuarter: Record<IncludedQuarter, number>;
  uniqueOfferings: number;
  uniqueCourseIds: number;
  duplicateRowsCollapsed: number;
  parsedInstructorAssignments: number;
  ignoredTbdTbaValues: number;
  courseIds: string[];
  offerings: ParsedChicanoLatinoCourseOffering[];
  terms: ParsedChicanoLatinoTerm[];
  scheduleTablesDiscovered: number;
  academicYear: string | null;
  lastUpdated: Date | null;
  parsingErrors: string[];
};

export type ChicanoLatinoScrapeSummary = {
  sourceRowsByQuarter: Record<IncludedQuarter, number>;
  normalizedRows: number;
  offeringsByQuarter: Record<IncludedQuarter, number>;
  uniqueOfferings: number;
  uniqueCourseIds: number;
  duplicateRowsCollapsed: number;
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

type CalendarTermForImport = {
  year: string;
  quarter: Term;
  instructionStart: Date;
};

type ImportScope = Omit<ParsedChicanoLatinoTerm, "header">;

type ImportableChicanoLatinoOfferings = {
  offerings: ParsedChicanoLatinoCourseOffering[];
  scopes: ImportScope[];
  skippedOrStaleTerms: string[];
};

type TableColumns = {
  course: number;
  title: number;
};

type InstructorParseResult = {
  names: string[];
  ignoredTbdTbaValues: number;
  parsingError: string | null;
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

const offeringKey = (offering: ParsedChicanoLatinoCourseOffering) =>
  `${scopeKey(offering)}|${offering.courseId}`;

function emptyQuarterCounts(): Record<IncludedQuarter, number> {
  return { Fall: 0, Winter: 0, Spring: 0 };
}

export function normalizeChicanoLatinoText(value: string): string {
  return normalizeWhitespace(value);
}

/** Catalogue/course-scraper IDs retain the slash in the CHC/LAT department code. */
export function normalizeChicanoLatinoCourseId(sourceCourseId: string): string | null {
  const normalized = normalizeChicanoLatinoText(sourceCourseId);
  const match = normalized.match(/^CHC\s*\/\s*LAT\s+(H?\d+[A-Z]*)$/i);
  if (!match) return null;

  const numberMatch = match[1].match(/^(H?)(\d+)([A-Z]*)$/i);
  if (!numberMatch) return null;
  const number = Number.parseInt(numberMatch[2], 10);
  if (!Number.isInteger(number)) return null;
  return `CHC/LAT${numberMatch[1].toUpperCase()}${number}${numberMatch[3].toUpperCase()}`;
}

export function parseChicanoLatinoAcademicYear(html: string): {
  academicYear: string;
  startYear: number;
} | null {
  const $ = load(html);
  const heading = $("h1, h2, h3, h4, h5, h6")
    .toArray()
    .map((element) => normalizeChicanoLatinoText($(element).text()))
    .find((value) => /^Tentative Course Offerings Schedule\s+20\d{2}/i.test(value));
  const match = heading?.match(
    /^Tentative Course Offerings Schedule\s+(20\d{2})\s*[-–—](20\d{2}|\d{2})$/i,
  );
  if (!match) return null;

  const startYear = Number.parseInt(match[1], 10);
  const endYearValue = Number.parseInt(match[2], 10);
  const endYear =
    match[2].length === 2 ? Math.floor(startYear / 100) * 100 + endYearValue : endYearValue;
  if (endYear !== startYear + 1) return null;
  return { academicYear: academicYearLabel(startYear), startYear };
}

export function parseChicanoLatinoLastUpdated(html: string): Date | null {
  const $ = load(html);
  const text = normalizeChicanoLatinoText($.root().text());
  const match = text.match(/\bLast updated:\s+([A-Za-z]+)\s+(\d{1,2}),\s+(20\d{2})\b/i);
  if (!match) return null;

  const months = [
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
  ];
  const month = months.indexOf(match[1].toLocaleLowerCase());
  const day = Number.parseInt(match[2], 10);
  const year = Number.parseInt(match[3], 10);
  if (month < 0 || day < 1 || day > 31) return null;

  const parsed = new Date(Date.UTC(year, month, day));
  return parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() === month &&
    parsed.getUTCDate() === day
    ? parsed
    : null;
}

export function parseChicanoLatinoSectionCaption(
  value: string,
  academic: { academicYear: string; startYear: number },
): ParsedChicanoLatinoTerm | null {
  const header = normalizeChicanoLatinoText(value);
  const match = header.match(/^(Fall|Winter|Spring)\s+Quarter\s+(20\d{2})$/i);
  if (!match) return null;

  const quarter = `${match[1][0].toUpperCase()}${match[1]
    .slice(1)
    .toLocaleLowerCase()}` as IncludedQuarter;
  const year = match[2];
  const expectedYear = quarter === "Fall" ? academic.startYear : academic.startYear + 1;
  if (Number.parseInt(year, 10) !== expectedYear) return null;
  return { header, academicYear: academic.academicYear, year, quarter };
}

function tableHeaders($: ReturnType<typeof load>, table: Cheerio<Element>): string[] {
  const headerRow = table.find("thead tr").first();
  const row = headerRow.length > 0 ? headerRow : table.find("tr").first();
  return row
    .children("th, td")
    .toArray()
    .map((cell) => normalizeChicanoLatinoText($(cell).text()));
}

function parseTableColumns(
  $: ReturnType<typeof load>,
  table: Cheerio<Element>,
  parsingErrors: string[],
  quarter: IncludedQuarter,
): TableColumns {
  const headers = tableHeaders($, table);
  const normalizedHeaders = headers.map((header) => header.toLocaleLowerCase());
  const course = normalizedHeaders.indexOf("course number");
  const title = normalizedHeaders.indexOf("course name");
  if (course < 0 || title < 0) {
    parsingErrors.push(
      `Chicano/Latino listing is missing Course Number or Course Name in its ${quarter} table`,
    );
  }
  return { course, title };
}

function trimInstructorMetadata(value: string): string {
  return value
    .replace(/\s*(?:-|–|—)\s*$/u, "")
    .replace(/[,*]+$/u, "")
    .trim();
}

function splitInstructorMetadata(metadata: string): string[] {
  const beforeCrossList = metadata.replace(
    /\s*(?:(?:-|–|—)\s*)?(?:same\s+as|cross\s+list\s*(?:w\/|with)?).*/iu,
    "",
  );
  return trimInstructorMetadata(beforeCrossList)
    .split(/\s*&\s*/u)
    .map((name) => normalizeChicanoLatinoText(name))
    .filter(Boolean);
}

export function parseChicanoLatinoInstructorNames(title: string): InstructorParseResult {
  const normalizedTitle = normalizeChicanoLatinoText(title);
  const openingCount = (normalizedTitle.match(/\(/g) ?? []).length;
  const closingCount = (normalizedTitle.match(/\)/g) ?? []).length;
  if (openingCount !== closingCount) {
    return {
      names: [],
      ignoredTbdTbaValues: 0,
      parsingError: `unbalanced instructor metadata parentheses in '${normalizedTitle}'`,
    };
  }

  const metadata = normalizedTitle.match(/\(([^()]*)\)/u)?.[1];
  if (metadata === undefined) {
    return { names: [], ignoredTbdTbaValues: 0, parsingError: null };
  }

  const names: string[] = [];
  let ignoredTbdTbaValues = 0;
  for (const name of splitInstructorMetadata(metadata)) {
    if (/^(?:TBD|TBA)$/iu.test(name)) {
      ignoredTbdTbaValues += 1;
      continue;
    }
    if (/^(?:online|on[ -]?line)$/iu.test(name)) continue;
    names.push(name);
  }
  return { names, ignoredTbdTbaValues, parsingError: null };
}

function normalizeInstructorName(value: string): string {
  return normalizeChicanoLatinoText(value)
    .replace(/[‐‑‒–—―-]/gu, " ")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replaceAll(/\s+/gu, " ")
    .trim()
    .toLocaleLowerCase();
}

function instructorMatchesSource(sourceName: string, knownName: string): boolean {
  const source = normalizeInstructorName(sourceName).split(" ").filter(Boolean);
  const known = normalizeInstructorName(knownName).split(" ").filter(Boolean);
  if (source.length === 0 || known.length < source.length) return false;
  return source.every((part, index) => part === known[known.length - source.length + index]);
}

export function resolveChicanoLatinoInstructors(
  parsed: string[],
  knownInstructors: KnownInstructor[],
): TentativeInstructor[] {
  const resolved: TentativeInstructor[] = [];
  for (const sourceName of Array.from(new Set(parsed)).toSorted()) {
    const candidates = knownInstructors.filter(({ name }) =>
      instructorMatchesSource(sourceName, name),
    );
    const departmentCandidates = candidates.filter(({ department }) =>
      /chicano\/latino studies/i.test(department),
    );
    const narrowed = departmentCandidates.length > 0 ? departmentCandidates : candidates;
    if (narrowed.length !== 1) continue;
    const [match] = narrowed;
    resolved.push({ status: "assigned", name: sourceName, ucinetid: match.ucinetid });
  }
  return resolved;
}

export function parseChicanoLatinoCourseOfferings(
  html: string,
): ParsedChicanoLatinoCourseOfferingsPage {
  const $ = load(html);
  const academic = parseChicanoLatinoAcademicYear(html);
  const parsingErrors: string[] = [];
  if (!academic) {
    parsingErrors.push("Chicano/Latino listing is missing a valid academic-year schedule heading");
  }

  const heading = $("h1, h2, h3, h4, h5, h6")
    .toArray()
    .find((element) =>
      /^Tentative Course Offerings Schedule\s+20\d{2}/i.test(
        normalizeChicanoLatinoText($(element).text()),
      ),
    );
  const scheduleRoot = heading ? $(heading).parent().first() : null;
  const tableCandidates = scheduleRoot
    ? $(scheduleRoot)
        .find("table")
        .toArray()
        .map((table) => ({ table: $(table), caption: $(table).find("caption").first().text() }))
        .filter(({ caption }) =>
          /^(?:Fall|Winter|Spring)\s+Quarter\s+20\d{2}$/i.test(normalizeChicanoLatinoText(caption)),
        )
    : [];

  const tablesByQuarter = new Map<
    IncludedQuarter,
    { table: Cheerio<Element>; term: ParsedChicanoLatinoTerm }
  >();
  if (academic) {
    for (const candidate of tableCandidates) {
      const caption = normalizeChicanoLatinoText(candidate.caption);
      const term = parseChicanoLatinoSectionCaption(caption, academic);
      if (!term) {
        parsingErrors.push(`Chicano/Latino listing has an unexpected section caption '${caption}'`);
        continue;
      }
      if (tablesByQuarter.has(term.quarter)) {
        parsingErrors.push(`Chicano/Latino listing has duplicate ${term.quarter} quarter tables`);
        continue;
      }
      tablesByQuarter.set(term.quarter, { table: candidate.table, term });
    }
  }

  const sourceRowsByQuarter = emptyQuarterCounts();
  const offeringsByQuarter = emptyQuarterCounts();
  const offerings = new Map<string, ParsedChicanoLatinoCourseOffering>();
  const courseIds = new Set<string>();
  let normalizedRows = 0;
  let duplicateRowsCollapsed = 0;
  let parsedInstructorAssignments = 0;
  let ignoredTbdTbaValues = 0;

  for (const quarter of INCLUDED_QUARTERS) {
    const section = tablesByQuarter.get(quarter);
    if (!section || !academic) continue;
    const columns = parseTableColumns($, section.table, parsingErrors, quarter);
    const bodyRows = section.table.find("tbody tr").toArray();
    const rows = bodyRows.length > 0 ? bodyRows : section.table.find("tr").toArray().slice(1);
    for (const [rowIndex, row] of rows.entries()) {
      const cells = $(row).children("th, td");
      const values = cells.toArray().map((cell) => normalizeChicanoLatinoText($(cell).text()));
      if (values.every((value) => value.length === 0)) continue;
      if (
        values[columns.course]?.toLocaleLowerCase() === "course number" &&
        values[columns.title]?.toLocaleLowerCase() === "course name"
      ) {
        continue;
      }
      sourceRowsByQuarter[quarter] += 1;

      const maxRequiredIndex = Math.max(columns.course, columns.title);
      if (columns.course < 0 || columns.title < 0 || cells.length <= maxRequiredIndex) {
        parsingErrors.push(
          `Chicano/Latino ${quarter} row ${rowIndex + 1} is missing required cells`,
        );
        continue;
      }
      const sourceCourseId = values[columns.course] ?? "";
      const courseId = normalizeChicanoLatinoCourseId(sourceCourseId);
      if (!courseId) {
        parsingErrors.push(
          `Chicano/Latino ${quarter} row ${rowIndex + 1} has malformed course identifier '${sourceCourseId}'`,
        );
        continue;
      }

      normalizedRows += 1;
      courseIds.add(courseId);
      const instructorResult = parseChicanoLatinoInstructorNames(values[columns.title] ?? "");
      parsedInstructorAssignments += instructorResult.names.length;
      ignoredTbdTbaValues += instructorResult.ignoredTbdTbaValues;
      if (instructorResult.parsingError) {
        parsingErrors.push(
          `Chicano/Latino ${quarter} row ${rowIndex + 1}: ${instructorResult.parsingError}`,
        );
      }

      const offering: ParsedChicanoLatinoCourseOffering = {
        academicYear: section.term.academicYear,
        courseId,
        year: section.term.year,
        quarter,
        instructors: instructorResult.names,
      };
      const key = offeringKey(offering);
      const existing = offerings.get(key);
      if (existing) {
        duplicateRowsCollapsed += 1;
        existing.instructors = Array.from(
          new Set([...existing.instructors, ...instructorResult.names]),
        );
      } else {
        offerings.set(key, offering);
        offeringsByQuarter[quarter] += 1;
      }
    }
  }

  for (const quarter of INCLUDED_QUARTERS) {
    if (!tablesByQuarter.has(quarter)) {
      parsingErrors.push(`Chicano/Latino listing is missing its ${quarter} quarter table`);
    }
    if (sourceRowsByQuarter[quarter] === 0 || offeringsByQuarter[quarter] === 0) {
      parsingErrors.push(`Chicano/Latino listing has no usable ${quarter} course rows`);
    }
  }

  const scheduleText = scheduleRoot ? $(scheduleRoot).text() : "";
  const lastUpdated = parseChicanoLatinoLastUpdated(scheduleText);
  if (/Last updated:/i.test(scheduleText) && !lastUpdated) {
    parsingErrors.push("Could not parse Chicano/Latino listing's Last updated value");
  }

  const parsedOfferings = Array.from(offerings.values());
  return {
    sourceRowsByQuarter,
    normalizedRows,
    offeringsByQuarter,
    uniqueOfferings: parsedOfferings.length,
    uniqueCourseIds: courseIds.size,
    duplicateRowsCollapsed,
    parsedInstructorAssignments,
    ignoredTbdTbaValues,
    courseIds: Array.from(courseIds).toSorted(),
    offerings: parsedOfferings,
    terms: INCLUDED_QUARTERS.flatMap((quarter) => {
      const section = tablesByQuarter.get(quarter);
      return section ? [section.term] : [];
    }),
    scheduleTablesDiscovered: tableCandidates.length,
    academicYear: academic?.academicYear ?? null,
    lastUpdated,
    parsingErrors,
  };
}

export function selectImportableChicanoLatinoOfferings(
  parsed: ParsedChicanoLatinoCourseOfferingsPage,
  calendarTerms: CalendarTermForImport[],
  now: Date,
): ImportableChicanoLatinoOfferings {
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
  const response = await fetcher(CHICANO_LATINO_STUDIES_COURSE_OFFERINGS_URL, {
    headers: { "User-Agent": "Anteater API tentative course offerings scraper" },
  });
  if (!response.ok) {
    throw new Error(
      `Failed to fetch ${CHICANO_LATINO_STUDIES_COURSE_OFFERINGS_URL}: HTTP ${response.status}`,
    );
  }
  return await response.text();
}

export async function doScrape(
  db: ReturnType<typeof database>,
  fetcher: typeof fetch = fetch,
  now = new Date(),
): Promise<ChicanoLatinoScrapeSummary> {
  const html = await fetchHtml(fetcher);
  const parsed = parseChicanoLatinoCourseOfferings(html);
  if (
    parsed.academicYear === null ||
    parsed.scheduleTablesDiscovered !== INCLUDED_QUARTERS.length ||
    parsed.terms.length !== INCLUDED_QUARTERS.length ||
    parsed.normalizedRows === 0
  ) {
    throw new Error("Chicano/Latino listing did not contain all undergraduate quarter tables");
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
    (name) => resolveChicanoLatinoInstructors([name], knownInstructors).length === 0,
  );
  for (const name of unresolvedInstructorNames) {
    console.warn(
      `Could not safely resolve Chicano/Latino instructor '${name}'; omitting assignment`,
    );
  }

  const importable = selectImportableChicanoLatinoOfferings(parsed, calendarTerms, now);
  const values: Array<typeof tentativeCourseOffering.$inferInsert> = importable.offerings
    .filter(({ courseId }) => knownCourseIds.has(courseId))
    .map((offering) => ({
      source: CHICANO_LATINO_STUDIES_COURSE_OFFERINGS_SOURCE,
      sourceUrl: CHICANO_LATINO_STUDIES_COURSE_OFFERINGS_URL,
      academicYear: offering.academicYear,
      courseId: offering.courseId,
      year: offering.year,
      quarter: offering.quarter,
      instructors: resolveChicanoLatinoInstructors(offering.instructors, knownInstructors),
      lastUpdated: parsed.lastUpdated,
    }));

  if (importable.offerings.length > 0 && values.length === 0) {
    throw new Error(
      "Chicano/Latino listing did not contain future offerings for any known Anteater API courses",
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
              eq(tentativeCourseOffering.source, CHICANO_LATINO_STUDIES_COURSE_OFFERINGS_SOURCE),
              inArray(tentativeCourseOffering.academicYear, academicYears),
            ),
          )
      : [];
  const relevantExistingRows = existingRows.filter((row) => scopeKeys.has(scopeKey(row)));
  const existingKeys = new Set(
    relevantExistingRows.map((row) =>
      offeringKey({ ...row, instructors: [] } as ParsedChicanoLatinoCourseOffering),
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
  for (const row of relevantExistingRows) {
    if (unmatchedCourseIds.includes(row.courseId)) {
      sourceCurrentKeys.add(
        offeringKey({ ...row, instructors: [] } as ParsedChicanoLatinoCourseOffering),
      );
    }
  }
  const cleanupEnabled = parsed.parsingErrors.length === 0;
  const rowsDeactivated = cleanupEnabled
    ? Array.from(existingKeys).filter((key) => !sourceCurrentKeys.has(key)).length
    : 0;

  if (importable.scopes.length > 0) {
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
        const scopeConditions = and(
          eq(tentativeCourseOffering.source, CHICANO_LATINO_STUDIES_COURSE_OFFERINGS_SOURCE),
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

  const resolvedInstructorAssignments = parsed.offerings.reduce(
    (total, offering) =>
      total + resolveChicanoLatinoInstructors(offering.instructors, knownInstructors).length,
    0,
  );
  const summary: ChicanoLatinoScrapeSummary = {
    sourceRowsByQuarter: parsed.sourceRowsByQuarter,
    normalizedRows: parsed.normalizedRows,
    offeringsByQuarter: parsed.offeringsByQuarter,
    uniqueOfferings: parsed.uniqueOfferings,
    uniqueCourseIds: parsed.uniqueCourseIds,
    duplicateRowsCollapsed: parsed.duplicateRowsCollapsed,
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
  };
  console.log(JSON.stringify(summary));
  return summary;
}
