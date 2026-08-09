import type { database } from "@packages/db";
import { and, eq, inArray, notInArray } from "@packages/db/drizzle";
import type { Term } from "@packages/db/schema";
import { calendarTerm, course, tentativeCourseOffering } from "@packages/db/schema";
import { conflictUpdateSetAllCols } from "@packages/db/utils";
import { load } from "cheerio";

export const BIOLOGICAL_SCIENCES_COURSE_OFFERINGS_SOURCE = "BIOLOGICAL_SCIENCES_COURSE_OFFERINGS";
export const BIOLOGICAL_SCIENCES_COURSE_OFFERINGS_URL =
  "https://undergraduate.bio.uci.edu/academics/course-offerings/";

const INCLUDED_QUARTERS = ["Fall", "Winter", "Spring"] as const;
type IncludedQuarter = (typeof INCLUDED_QUARTERS)[number];

export type ParsedBioTerm = {
  header: string;
  academicYear: string;
  year: string;
  quarter: IncludedQuarter;
};

export type ParsedBioCourseOffering = Omit<ParsedBioTerm, "header"> & {
  courseId: string;
  instructors: [];
};

export type ParsedBioSection = {
  name: string;
  terms: ParsedBioTerm[];
};

export type ParsedBioCourseOfferingsPage = {
  rowsParsed: number;
  offerings: ParsedBioCourseOffering[];
  sections: ParsedBioSection[];
  lastUpdated: Date | null;
  parsingErrors: string[];
};

export type BioScrapeSummary = {
  rowsParsed: number;
  offeringsProduced: number;
  rowsInserted: number;
  rowsUpdated: number;
  rowsDeactivated: number;
  unmatchedCourseIds: string[];
  skippedOrStaleSections: string[];
  parsingErrors: string[];
};

type CalendarTermForImport = {
  year: string;
  quarter: Term;
  instructionStart: Date;
};

type ImportScope = Omit<ParsedBioTerm, "header">;

type ImportableBioOfferings = {
  offerings: ParsedBioCourseOffering[];
  scopes: ImportScope[];
  skippedOrStaleSections: string[];
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

const academicYearLabel = (startYear: number) => `${startYear}-${startYear + 1}`;

const termKey = (term: { year: string; quarter: string }) => `${term.year} ${term.quarter}`;

const scopeKey = (term: { academicYear: string; year: string; quarter: string }) =>
  `${term.academicYear}|${termKey(term)}`;

const offeringKey = (offering: ParsedBioCourseOffering) =>
  `${scopeKey(offering)}|${offering.courseId}`;

export function normalizeBioCourseId(sourceCourseId: string): string | null {
  const normalized = normalizeWhitespace(sourceCourseId.toUpperCase());
  const prefixed = normalized.match(/^(?:BIO\s*SCI|BIOSCI)\s*([A-Z]*\d+[A-Z]*)$/);
  const courseNumber = normalizeWhitespace(prefixed?.[1] ?? normalized).replaceAll(" ", "");

  // An unrecognized department prefix must not be reinterpreted as a BIO SCI course.
  if (!prefixed && /\s/.test(normalized)) return null;

  const match = courseNumber.match(/^([A-Z]*)(\d+)([A-Z]*)$/);
  if (!match) return null;

  const numeric = Number.parseInt(match[2], 10);
  if (!Number.isInteger(numeric)) return null;
  return `BIOSCI${match[1]}${numeric}${match[3]}`;
}

export function parseBioTermHeader(value: string): ParsedBioTerm | null {
  const header = normalizeWhitespace(value.toUpperCase());
  const match = header.match(/^([FWS])(\d{2}|\d{4})$/);
  if (!match) return null;

  const quarter = {
    F: "Fall",
    W: "Winter",
    S: "Spring",
  }[match[1]] as IncludedQuarter;
  const sourceYear = Number.parseInt(match[2], 10);
  const year = match[2].length === 2 ? 2000 + sourceYear : sourceYear;
  if (year < 2000 || year > 2099) return null;

  const academicYearStart = quarter === "Fall" ? year : year - 1;
  return {
    header,
    academicYear: academicYearLabel(academicYearStart),
    year: year.toString(10),
    quarter,
  };
}

function parseLastUpdated(html: string): Date | null {
  const $ = load(html);
  const lastUpdateText = $("strong")
    .toArray()
    .map((element) => normalizeWhitespace($(element).text()))
    .find((text) => /^Last update:/i.test(text));
  if (!lastUpdateText) return null;

  const match = lastUpdateText.match(
    /Last update:\s+([A-Za-z]+)\s+(\d{1,2})(?:st|nd|rd|th)?,\s+(\d{4})/i,
  );
  if (!match) return null;

  const month = MONTHS.indexOf(match[1].toLocaleLowerCase() as (typeof MONTHS)[number]);
  const day = Number.parseInt(match[2], 10);
  const year = Number.parseInt(match[3], 10);
  if (month === -1 || day < 1 || day > 31) return null;

  const parsed = new Date(Date.UTC(year, month, day));
  return parsed.getUTCFullYear() === year && parsed.getUTCMonth() === month ? parsed : null;
}

function extractCourseLabel(value: string): string {
  return normalizeWhitespace(value).split(/\s+[–—-]\s+/, 1)[0];
}

function cellIndicatesOffered(value: string): boolean {
  const normalized = normalizeWhitespace(value);
  return /[✓✔]/u.test(normalized) || /^yes$/i.test(normalized);
}

export function parseBioCourseOfferings(html: string): ParsedBioCourseOfferingsPage {
  const $ = load(html);
  const tables = $("table.tablepress");
  if (tables.length === 0) {
    throw new Error("Biological Sciences course offerings page did not contain TablePress tables");
  }

  const sections: ParsedBioSection[] = [];
  const offerings = new Map<string, ParsedBioCourseOffering>();
  const parsingErrors: string[] = [];
  let rowsParsed = 0;

  tables.each((tableIndex, table) => {
    const headers = $(table).find("thead th");
    const sectionName = normalizeWhitespace(headers.first().text()) || `table ${tableIndex + 1}`;
    const terms: Array<ParsedBioTerm & { columnIndex: number }> = [];

    headers.each((columnIndex, header) => {
      if (columnIndex === 0) return;
      const headerText = normalizeWhitespace($(header).text());
      const term = parseBioTermHeader(headerText);
      if (term) terms.push({ ...term, columnIndex });
      else if (headerText) {
        parsingErrors.push(`${sectionName}: unrecognized term header '${headerText}'`);
      }
    });

    if (terms.length === 0) {
      parsingErrors.push(`${sectionName}: no Fall, Winter, or Spring term headers`);
      return;
    }

    sections.push({
      name: sectionName,
      terms: terms.map(({ columnIndex: _, ...term }) => term),
    });

    $(table)
      .find("tbody tr")
      .each((rowIndex, row) => {
        rowsParsed += 1;
        const cells = $(row).find("td");
        const courseLabel = extractCourseLabel(cells.first().text());
        const courseId = normalizeBioCourseId(courseLabel);
        if (!courseId) {
          parsingErrors.push(
            `${sectionName} row ${rowIndex + 1}: unrecognized course identifier '${courseLabel}'`,
          );
          return;
        }

        for (const term of terms) {
          const cell = cells.eq(term.columnIndex);
          if (cell.length === 0) {
            parsingErrors.push(
              `${sectionName} row ${rowIndex + 1}: missing ${term.header} availability cell`,
            );
            continue;
          }

          const availability = normalizeWhitespace(cell.text());
          if (!cellIndicatesOffered(availability)) {
            if (availability) {
              parsingErrors.push(
                `${sectionName} row ${rowIndex + 1}: unrecognized ${term.header} availability '${availability}'`,
              );
            }
            continue;
          }

          const offering: ParsedBioCourseOffering = {
            academicYear: term.academicYear,
            courseId,
            year: term.year,
            quarter: term.quarter,
            instructors: [],
          };
          offerings.set(offeringKey(offering), offering);
        }
      });
  });

  const lastUpdated = parseLastUpdated(html);
  if (/Last update:/i.test($.root().text()) && !lastUpdated) {
    parsingErrors.push("Could not parse the page's Last update value");
  }

  return {
    rowsParsed,
    offerings: Array.from(offerings.values()),
    sections,
    lastUpdated,
    parsingErrors,
  };
}

export function selectImportableBioOfferings(
  parsed: ParsedBioCourseOfferingsPage,
  calendarTerms: CalendarTermForImport[],
  now: Date,
): ImportableBioOfferings {
  const calendarByTerm = new Map(calendarTerms.map((term) => [termKey(term), term]));
  const importableScopeKeys = new Set<string>();
  const scopes = new Map<string, ImportScope>();
  const skippedOrStaleSections: string[] = [];

  for (const section of parsed.sections) {
    const skippedTerms: string[] = [];
    for (const term of section.terms) {
      const calendar = calendarByTerm.get(termKey(term));
      if (!calendar) {
        skippedTerms.push(`${term.header} (missing calendar metadata)`);
        continue;
      }
      if (calendar.instructionStart.getTime() <= now.getTime()) {
        skippedTerms.push(`${term.header} (term has begun)`);
        continue;
      }

      importableScopeKeys.add(scopeKey(term));
      scopes.set(scopeKey(term), {
        academicYear: term.academicYear,
        year: term.year,
        quarter: term.quarter,
      });
    }
    if (skippedTerms.length > 0) {
      skippedOrStaleSections.push(`${section.name}: skipped ${skippedTerms.join(", ")}`);
    }
  }

  return {
    offerings: parsed.offerings.filter((offering) => importableScopeKeys.has(scopeKey(offering))),
    scopes: Array.from(scopes.values()),
    skippedOrStaleSections,
  };
}

export function shouldCleanupBioSource(parsed: ParsedBioCourseOfferingsPage): boolean {
  return parsed.parsingErrors.length === 0;
}

async function fetchHtml(fetcher: typeof fetch): Promise<string> {
  const response = await fetcher(BIOLOGICAL_SCIENCES_COURSE_OFFERINGS_URL, {
    headers: { "User-Agent": "Anteater API tentative course offerings scraper" },
  });
  if (!response.ok) {
    throw new Error(
      `Failed to fetch ${BIOLOGICAL_SCIENCES_COURSE_OFFERINGS_URL}: HTTP ${response.status}`,
    );
  }
  return await response.text();
}

export async function doScrape(
  db: ReturnType<typeof database>,
  fetcher: typeof fetch = fetch,
  now = new Date(),
): Promise<BioScrapeSummary> {
  const html = await fetchHtml(fetcher);
  const parsed = parseBioCourseOfferings(html);
  if (parsed.rowsParsed === 0) {
    throw new Error("Biological Sciences listing did not contain any course rows");
  }
  const parsedCourseIds = Array.from(
    new Set(parsed.offerings.map(({ courseId }) => courseId)),
  ).toSorted();
  const sourceYears = Array.from(
    new Set(parsed.sections.flatMap(({ terms }) => terms.map(({ year }) => year))),
  );

  const [knownCourses, calendarTerms] = await Promise.all([
    parsedCourseIds.length > 0
      ? db.select({ id: course.id }).from(course).where(inArray(course.id, parsedCourseIds))
      : Promise.resolve([]),
    sourceYears.length > 0
      ? db
          .select({
            year: calendarTerm.year,
            quarter: calendarTerm.quarter,
            instructionStart: calendarTerm.instructionStart,
          })
          .from(calendarTerm)
          .where(inArray(calendarTerm.year, sourceYears))
      : Promise.resolve([]),
  ]);
  const knownCourseIds = new Set(knownCourses.map(({ id }) => id));
  const unmatchedCourseIds = parsedCourseIds.filter((id) => !knownCourseIds.has(id));
  const importable = selectImportableBioOfferings(parsed, calendarTerms, now);
  const values: Array<typeof tentativeCourseOffering.$inferInsert> = importable.offerings
    .filter(({ courseId }) => knownCourseIds.has(courseId))
    .map((offering) => ({
      source: BIOLOGICAL_SCIENCES_COURSE_OFFERINGS_SOURCE,
      sourceUrl: BIOLOGICAL_SCIENCES_COURSE_OFFERINGS_URL,
      academicYear: offering.academicYear,
      courseId: offering.courseId,
      year: offering.year,
      quarter: offering.quarter,
      instructors: offering.instructors,
      lastUpdated: parsed.lastUpdated,
    }));

  if (importable.offerings.length > 0 && values.length === 0) {
    throw new Error(
      "Biological Sciences listing did not contain future offerings for any known Anteater API courses",
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
              eq(tentativeCourseOffering.source, BIOLOGICAL_SCIENCES_COURSE_OFFERINGS_SOURCE),
              inArray(tentativeCourseOffering.academicYear, academicYears),
            ),
          )
      : [];
  const relevantExistingRows = existingRows.filter((row) => scopeKeys.has(scopeKey(row)));
  const existingKeys = new Set(
    relevantExistingRows.map((row) =>
      offeringKey({ ...row, instructors: [] } as ParsedBioCourseOffering),
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
  // A partially parsed page is not a successful source snapshot, so it may upsert recovered rows
  // but must not remove prior data. This table has no active flag; scoped deletion is deactivation.
  const cleanupEnabled = shouldCleanupBioSource(parsed);
  const rowsDeactivated = cleanupEnabled
    ? Array.from(existingKeys).filter((key) => !sourceCurrentKeys.has(key)).length
    : 0;

  if (importable.scopes.length > 0) {
    await db.transaction(async (tx) => {
      for (const scope of importable.scopes) {
        const sourceCourseIds = importable.offerings
          .filter((offering) => scopeKey(offering) === scopeKey(scope))
          .map(({ courseId }) => courseId);
        const scopeConditions = and(
          eq(tentativeCourseOffering.source, BIOLOGICAL_SCIENCES_COURSE_OFFERINGS_SOURCE),
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

  const summary: BioScrapeSummary = {
    rowsParsed: parsed.rowsParsed,
    offeringsProduced: parsed.offerings.length,
    rowsInserted,
    rowsUpdated,
    rowsDeactivated,
    unmatchedCourseIds,
    skippedOrStaleSections: importable.skippedOrStaleSections,
    parsingErrors: parsed.parsingErrors,
  };
  console.log(JSON.stringify(summary));
  return summary;
}
