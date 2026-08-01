import type { database } from "@packages/db";
import { and, eq, inArray, ne } from "@packages/db/drizzle";
import type { TentativeInstructor, Term } from "@packages/db/schema";
import { course, instructor, tentativeCourseOffering } from "@packages/db/schema";
import { type Cheerio, type CheerioAPI, load } from "cheerio";
import type { Element } from "domhandler";

export const ICS_COURSE_OFFERINGS_SOURCE = "ICS_COURSE_OFFERINGS";

const ICS_COURSE_OFFERINGS_URL = "https://courselisting.ics.uci.edu/ugrad_courses/";
const ICS_COURSE_OFFERINGS_SOURCE_URL = "https://courselisting.ics.uci.edu/";
const INCLUDED_QUARTERS = ["Fall", "Winter", "Spring"] as const;
type IncludedQuarter = (typeof INCLUDED_QUARTERS)[number];

const DEPARTMENT_TO_ANTEATER_ID = {
  CS: "COMPSCI",
  CSE: "CSE",
  ICS: "I&CSCI",
  INF: "IN4MATX",
  STATS: "STATS",
} as const;

type ParsedInstructor = {
  name: string;
  ucinetidCandidate: string | null;
  isPlaceholder: boolean;
};

export type ParsedTentativeCourseOffering = {
  academicYear: string;
  courseId: string;
  year: string;
  quarter: IncludedQuarter;
  instructors: ParsedInstructor[];
};

type KnownInstructor = {
  ucinetid: string;
  name: string;
};

type TermColumn = {
  index: number;
  year: string;
  quarter: IncludedQuarter;
};

const normalizeWhitespace = (value: string) => value.replaceAll(/\s+/g, " ").trim();

const normalizeName = (value: string) =>
  normalizeWhitespace(value).toLocaleLowerCase().replaceAll(/[.,]/g, "");

const academicYearLabel = (startYear: number) => `${startYear}-${startYear + 1}`;

export function normalizeIcsCourseId(sourceCourseId: string): string | null {
  const match = normalizeWhitespace(sourceCourseId.toUpperCase()).match(
    /^(CS|CSE|ICS|INF|STATS)\s+(.+)$/,
  );
  if (!match) return null;

  const department = match[1] as keyof typeof DEPARTMENT_TO_ANTEATER_ID;
  const courseNumber = match[2].replaceAll(/\s+/g, "").replace(/^0+(?=\d)/, "");
  return `${DEPARTMENT_TO_ANTEATER_ID[department]}${courseNumber}`;
}

export function parseCurrentAcademicYear(html: string): number {
  const $ = load(html);
  const value =
    $("#year option[selected]").attr("value") ?? $("#year option").first().attr("value");
  const startYear = Number.parseInt(value ?? "", 10);
  if (!Number.isInteger(startYear) || startYear < 2000) {
    throw new Error("ICS course offerings page did not contain a valid current academic year");
  }
  return startYear;
}

function extractUcinetidCandidate(href: string | undefined): string | null {
  if (!href) return null;
  const parsed = new URL(href, ICS_COURSE_OFFERINGS_URL);
  const directoryUid = parsed.searchParams.get("uid");
  const profileUid = parsed.pathname.match(/~([^/]+)/)?.[1];
  const candidate = normalizeWhitespace(directoryUid ?? profileUid ?? "").toLocaleLowerCase();
  return /^[a-z][a-z0-9]{1,19}$/.test(candidate) ? candidate : null;
}

function isPlaceholderInstructor(name: string, ucinetidCandidate: string | null): boolean {
  const normalized = normalizeWhitespace(name).toUpperCase();
  if (["TBD", "TENTATIVE", "STAFF"].includes(normalized)) return true;
  if (["tbd", "tentat", "staff"].includes(ucinetidCandidate ?? "")) return true;

  // The live source sometimes assigns a department rather than a person (for example, "EECS").
  return normalized.length > 1 && normalized === normalized.toUpperCase() && !/[a-z]/.test(name);
}

function parseInstructorCell($: CheerioAPI, cell: Element): ParsedInstructor[] {
  const cellText = normalizeWhitespace(
    $(cell)
      .text()
      .replaceAll(/\(\d+\)/g, ""),
  );
  if (!cellText) return [];

  const links = $(cell).find("a").toArray();
  const parsed =
    links.length > 0
      ? links.map((link) => {
          const name = normalizeWhitespace($(link).text());
          const ucinetidCandidate = extractUcinetidCandidate($(link).attr("href"));
          return {
            name,
            ucinetidCandidate,
            isPlaceholder: isPlaceholderInstructor(name, ucinetidCandidate),
          };
        })
      : [
          {
            name: cellText,
            ucinetidCandidate: null,
            isPlaceholder: isPlaceholderInstructor(cellText, null),
          },
        ];

  return parsed.filter(({ name }) => name.length > 0);
}

function parseTermColumns(
  $: CheerioAPI,
  headers: Cheerio<Element>,
  academicYearStart: number,
): TermColumn[] {
  const columns: TermColumn[] = [];
  const expectedYear = {
    Fall: academicYearStart,
    Winter: academicYearStart + 1,
    Spring: academicYearStart + 1,
  } satisfies Record<IncludedQuarter, number>;

  headers.each((index, header) => {
    const text = normalizeWhitespace($(header).text());
    // Summer sometimes appears in year-specific source listings despite the landing-page disclaimer.
    // This integration intentionally imports Fall/Winter/Spring only.
    if (/^Summer\b/i.test(text)) return;

    const match = text.match(/^(Fall|Winter|Spring)\s+(\d{4})$/i);
    if (!match) return;

    const quarterText = match[1];
    const quarter =
      `${quarterText[0].toUpperCase()}${quarterText.slice(1).toLowerCase()}` as IncludedQuarter;

    const year = Number.parseInt(match[2], 10);
    if (year !== expectedYear[quarter]) {
      throw new Error(
        `ICS listing has ${quarter} ${year}, expected ${quarter} ${expectedYear[quarter]}`,
      );
    }
    columns.push({ index, year: year.toString(10), quarter });
  });

  if (!INCLUDED_QUARTERS.every((quarter) => columns.some((column) => column.quarter === quarter))) {
    throw new Error("ICS listing did not contain Fall, Winter, and Spring columns");
  }
  return columns;
}

export function parseIcsCourseOfferings(
  html: string,
  academicYearStart: number,
): ParsedTentativeCourseOffering[] {
  const $ = load(html);
  const table = $("#listing");
  if (table.length !== 1) throw new Error("ICS listing did not contain exactly one #listing table");

  const headers = table.find("thead th");
  const titleColumnIndex = headers
    .toArray()
    .findIndex((header) => normalizeWhitespace($(header).text()).toLocaleLowerCase() === "title");
  if (titleColumnIndex === -1) throw new Error("ICS listing did not contain its title column");

  const termColumns = parseTermColumns($, headers, academicYearStart);
  const academicYear = academicYearLabel(academicYearStart);
  const offerings: ParsedTentativeCourseOffering[] = [];
  let supportedCourseCount = 0;

  table.find("tbody tr").each((_, row) => {
    const cells = $(row).find("td");
    const sourceCourseId = normalizeWhitespace(cells.eq(titleColumnIndex).find(".visited").text());
    const courseId = normalizeIcsCourseId(sourceCourseId);
    if (!courseId) return;
    supportedCourseCount += 1;

    for (const column of termColumns) {
      const cell = cells.get(column.index);
      if (!cell) continue;
      const instructors = parseInstructorCell($, cell);
      if (instructors.length === 0) continue;
      offerings.push({
        academicYear,
        courseId,
        year: column.year,
        quarter: column.quarter,
        instructors,
      });
    }
  });

  if (supportedCourseCount === 0) {
    throw new Error("ICS listing did not contain any supported courses");
  }
  return offerings;
}

export function resolveIcsInstructors(
  parsed: ParsedInstructor[],
  knownInstructors: KnownInstructor[],
): TentativeInstructor[] {
  const byUcinetid = new Map(
    knownInstructors.map((known) => [known.ucinetid.toLocaleLowerCase(), known]),
  );
  const byName = knownInstructors.reduce((acc, known) => {
    const normalized = normalizeName(known.name);
    acc.set(normalized, [...(acc.get(normalized) ?? []), known]);
    return acc;
  }, new Map<string, KnownInstructor[]>());

  const resolved = parsed.map<TentativeInstructor>((candidate) => {
    if (candidate.isPlaceholder) return { status: "tbd", name: "TBD", ucinetid: null };

    const byId = candidate.ucinetidCandidate
      ? byUcinetid.get(candidate.ucinetidCandidate)
      : undefined;
    if (byId) return { status: "assigned", name: byId.name, ucinetid: byId.ucinetid };

    const nameMatches = byName.get(normalizeName(candidate.name)) ?? [];
    if (nameMatches.length === 1) {
      const [match] = nameMatches;
      return { status: "assigned", name: match.name, ucinetid: match.ucinetid };
    }

    if (candidate.ucinetidCandidate) {
      return {
        status: "assigned",
        name: candidate.name,
        ucinetid: candidate.ucinetidCandidate,
      };
    }

    console.warn(`Could not safely resolve ICS instructor '${candidate.name}'; using TBD`);
    return { status: "tbd", name: "TBD", ucinetid: null };
  });

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

async function fetchHtml(fetcher: typeof fetch, url: string): Promise<string> {
  const response = await fetcher(url, {
    headers: { "User-Agent": "Anteater API tentative course offerings scraper" },
  });
  if (!response.ok) throw new Error(`Failed to fetch ${url}: HTTP ${response.status}`);
  return await response.text();
}

export async function doScrape(
  db: ReturnType<typeof database>,
  fetcher: typeof fetch = fetch,
): Promise<void> {
  const lastUpdated = new Date();
  const landingHtml = await fetchHtml(fetcher, ICS_COURSE_OFFERINGS_URL);
  const academicYearStart = parseCurrentAcademicYear(landingHtml);
  const listingUrl = new URL("listing-course.php", ICS_COURSE_OFFERINGS_URL);
  listingUrl.search = new URLSearchParams({
    year: academicYearStart.toString(10),
    level: "ALL",
    department: "ALL",
    program: "ALL",
  }).toString();

  const listingHtml = await fetchHtml(fetcher, listingUrl.toString());
  const parsedOfferings = parseIcsCourseOfferings(listingHtml, academicYearStart);
  const courseIds = Array.from(new Set(parsedOfferings.map(({ courseId }) => courseId)));

  const [knownCourses, knownInstructors] = await Promise.all([
    db.select({ id: course.id }).from(course).where(inArray(course.id, courseIds)),
    db
      .select({ ucinetid: instructor.ucinetid, name: instructor.name })
      .from(instructor)
      .where(ne(instructor.ucinetid, "student")),
  ]);
  const knownCourseIds = new Set(knownCourses.map(({ id }) => id));
  const academicYear = academicYearLabel(academicYearStart);
  const values: Array<typeof tentativeCourseOffering.$inferInsert> = parsedOfferings
    .filter(({ courseId }) => knownCourseIds.has(courseId))
    .map((offering) => ({
      source: ICS_COURSE_OFFERINGS_SOURCE,
      sourceUrl: ICS_COURSE_OFFERINGS_SOURCE_URL,
      academicYear: offering.academicYear,
      courseId: offering.courseId,
      year: offering.year,
      quarter: offering.quarter as Term,
      instructors: resolveIcsInstructors(offering.instructors, knownInstructors),
      lastUpdated,
    }));

  if (values.length === 0) {
    throw new Error("ICS listing did not contain offerings for any known Anteater API courses");
  }

  await db.transaction(async (tx) => {
    await tx
      .delete(tentativeCourseOffering)
      .where(
        and(
          eq(tentativeCourseOffering.source, ICS_COURSE_OFFERINGS_SOURCE),
          eq(tentativeCourseOffering.academicYear, academicYear),
        ),
      );
    await tx.insert(tentativeCourseOffering).values(values);
  });

  console.log(
    `Imported ${values.length} ICS tentative offerings for academic year ${academicYear}`,
  );
}
