import { dirname } from "node:path";
import { exit } from "node:process";
import { fileURLToPath } from "node:url";
import { database } from "@packages/db";
import { desc, eq, inArray, or } from "@packages/db/drizzle";
import type { CoursePrerequisite, Prerequisite, PrerequisiteTree } from "@packages/db/schema";
import { course, prerequisite, websocDepartment, websocSchool } from "@packages/db/schema";
import { type CurriculumTerm, type SampleProgramEntry, sampleProgram } from "@packages/db/schema";
import { orNull, sleep } from "@packages/stdlib";
import { type Cheerio, load } from "cheerio";
import fetch from "cross-fetch";
import type { AnyNode } from "domhandler";
import type { Element as DomElement } from "domhandler";
import { diffString } from "json-diff";
import readlineSync from "readline-sync";
import sortKeys from "sort-keys";
import winston from "winston";

const __dirname = dirname(fileURLToPath(import.meta.url));

const defaultFormat = [
  winston.format.timestamp(),
  winston.format.printf((info) => `[${info.timestamp} ${info.level}] ${info.message}`),
];

const logger = winston.createLogger({
  level: "info",
  format: winston.format.combine(...defaultFormat),
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(winston.format.colorize(), ...defaultFormat),
    }),
    new winston.transports.File({
      filename: `${__dirname}/../logs/${Date.now()}.log`,
    }),
  ],
});

const CATALOGUE_URL = "https://catalogue.uci.edu";

const PREREQ_URL = "https://www.reg.uci.edu/cob/prrqcgi";

const MAX_DELAY_MS = 8_000;

const HEADERS_INIT = {
  Connection: "keep-alive",
};

const prereqFieldLabels = {
  Course: 0,
  Title: 1,
  Prerequisite: 2,
};

const unitFormatter = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 2,
  minimumFractionDigits: 2,
});

const DEPT_TO_ALIAS = {
  COMPSCI: "CS",
  EARTHSS: "ESS",
  "I&C SCI": "ICS",
  IN4MATX: "INF",
  ENGRMAE: "MAE",
  WRITING: "WR",
} as const;

type DeptAliasMap = typeof DEPT_TO_ALIAS;
type DeptCode = keyof DeptAliasMap;

const getDepartmentAlias = (dept: string) => orNull(DEPT_TO_ALIAS[dept as DeptCode]);

type ParseContext = {
  $: ReturnType<typeof load>;
  deptCode: string;
  schoolName: string;
  departmentName: string;
  updatedAt: Date;
  prereqs?: Map<string, PrerequisiteTree>;
};

function parseCourseBlock(
  context: ParseContext,
  el: DomElement,
): typeof course.$inferInsert | null {
  const { $, deptCode, schoolName, departmentName, prereqs, updatedAt } = context;

  const $b = $(el);

  const codeRaw = norm($b.find(".detail-code").first().text());
  const titleRaw = norm($b.find(".detail-title").first().text());
  const unitsRaw = norm($b.find(".detail-hours_html").first().text());
  if (!codeRaw || !titleRaw || !unitsRaw) return null;

  const code = stripFinalPeriod(codeRaw);
  const title = stripFinalPeriod(titleRaw);

  const { minUnits, maxUnits } = parseUnits(unitsRaw);

  const courseNumber = code.startsWith(deptCode) ? code.slice(deptCode.length).trim() : code;
  const courseNumeric = Number.parseInt(courseNumber.replace(/[A-Z]/g, ""), 10);
  const courseLevel =
    Number.isFinite(courseNumeric) && courseNumeric < 100
      ? "LowerDiv"
      : courseNumeric < 200
        ? "UpperDiv"
        : "Graduate";

  const id = `${deptCode} ${courseNumber}`.replace(/ /g, "");

  const desc = norm($b.find(".courseblockextra").first().text());
  const prereqText = textAfterLabel($b.find(".detail-prereqs").first().text(), "Prerequisite");
  const coreqText = textAfterLabel(
    $b.find(".detail-coreqs, .detail-corequisites").first().text(),
    "Corequisite",
  );
  const concText = textAfterLabel($b.find(".detail-concurrent").first().text(), "Concurrent with");
  const sameAsText = textAfterLabel($b.find(".detail-same_as").first().text(), "Same as");
  const overlapText = textAfterLabel(
    $b.find(".detail-overlaps_with").first().text(),
    "Overlaps with",
  );
  const restrText = textAfterLabel($b.find(".detail-restrictions").first().text(), "Restriction");
  const gradingText = textAfterLabel(
    $b.find(".detail-grading_option").first().text(),
    "Grading Option",
  );
  const repeatText = textAfterLabel(
    $b.find(".detail-repeatability").first().text(),
    "Repeatability",
  );
  const geText = norm($b.find(".detail-gened").first().text());
  const geFlags = generateGEs(geText ? [geText] : []);

  return {
    id,
    department: deptCode,
    courseNumber,
    school: schoolName,
    title,
    courseLevel,
    minUnits,
    maxUnits,
    description: desc || "",
    departmentName,
    prerequisiteTree: prereqs?.get(`${deptCode} ${courseNumber}`) ?? {},
    prerequisiteText: prereqText,
    repeatability: repeatText,
    gradingOption: gradingText,
    concurrent: concText,
    sameAs: sameAsText,
    restriction: restrText,
    overlap: overlapText,
    corequisites: coreqText,
    ...geFlags,
    updatedAt,
  };
}

async function fetchWithDelay(url: string, delayMs = 1000) {
  try {
    logger.info(`Making request to ${url}`);
    await sleep(delayMs);
    const res = await fetch(url, { headers: HEADERS_INIT }).then((x) => x.text());
    logger.info("Request succeeded");
    return res;
  } catch {
    const delay = Math.min(2 * delayMs, MAX_DELAY_MS);
    logger.warn(`Rate limited, waiting for ${delay} ms`);
    return await fetchWithDelay(url, delay);
  }
}

function parsePrerequisite(prereq: string): Prerequisite | undefined {
  const reqWithGradeMatch = prereq.match(/^([^()]+)\s+\( min (\S+) = (\S{1,2}) \)$/);
  if (reqWithGradeMatch) {
    return reqWithGradeMatch[2].trim() === "grade"
      ? {
          prereqType: "course",
          coreq: false,
          courseId: reqWithGradeMatch[1].trim(),
          minGrade: reqWithGradeMatch[3].trim(),
        }
      : {
          prereqType: "exam",
          examName: reqWithGradeMatch[1].trim(),
          minGrade: reqWithGradeMatch[3].trim(),
        };
  }
  const courseCoreqMatch = prereq.match(/^([^()]+)\s+\( coreq \)$/);
  if (courseCoreqMatch) {
    return { prereqType: "course", coreq: true, courseId: courseCoreqMatch[1].trim() };
  }
  if (prereq.match(/^AP.*|^[A-Z0-9&/\s]+\d\S*$/)) {
    return prereq.startsWith("AP")
      ? { prereqType: "exam", examName: prereq }
      : { prereqType: "course", coreq: false, courseId: prereq };
  }
}

function parseAntirequisite(prereq: string): Prerequisite | undefined {
  const antiAPReqMatch = prereq.match(/^NO\s(AP\s.+?)\sscore\sof\s(\d)\sor\sgreater$/);
  if (antiAPReqMatch) {
    return {
      prereqType: "exam",
      examName: antiAPReqMatch[1].trim(),
      minGrade: antiAPReqMatch[2].trim(),
    };
  }
  const antiCourseMatch = prereq.match(/^NO\s([A-Z0-9&/\s]+\d\S*)$/);
  if (antiCourseMatch) {
    return { prereqType: "course", coreq: false, courseId: antiCourseMatch[1].trim() };
  }
}

function buildANDLeaf(prereqTree: PrerequisiteTree, prereq: string) {
  if (prereq.startsWith("NO")) {
    const req = parseAntirequisite(prereq);
    if (req) {
      prereqTree.NOT?.push(req);
    }
  } else {
    const req = parsePrerequisite(prereq);
    if (req) {
      prereqTree.AND?.push(req);
    }
  }
}

function buildORLeaf(prereqTree: PrerequisiteTree, prereq: string) {
  const req: Prerequisite | undefined = prereq.startsWith("NO")
    ? parseAntirequisite(prereq)
    : parsePrerequisite(prereq);
  if (req) {
    prereqTree.OR?.push(req);
  }
}

function buildPrereqTree(prereqList: string): PrerequisiteTree {
  const prereqTree: PrerequisiteTree = { AND: [], NOT: [] };
  const prereqs = prereqList.split(/AND/).map((prereq) => prereq.trim());
  for (const prereq of prereqs) {
    if (prereq[0] === "(") {
      const orReqs = prereq
        .slice(1, -1)
        .trim()
        .split(/ OR /)
        .map((req) => req.trim());
      const orTree: PrerequisiteTree = { OR: [] };
      for (const orReq of orReqs) {
        buildORLeaf(orTree, orReq.trim());
      }
      if (orTree.OR?.length) {
        prereqTree.AND?.push(orTree);
      }
    } else {
      buildANDLeaf(prereqTree, prereq);
    }
  }
  if (prereqTree.AND) {
    if (!prereqTree.NOT && prereqTree.AND.length === 1 && "OR" in prereqTree.AND[0]) {
      prereqTree.OR = prereqTree.AND[0].OR;
      prereqTree.AND = undefined;
    } else if (prereqTree.NOT?.length) {
      prereqTree.AND.push({ NOT: prereqTree.NOT });
      prereqTree.NOT = undefined;
    }
  }
  return {
    ...(prereqTree.AND?.length && { AND: prereqTree.AND }),
    ...(prereqTree.OR?.length && { OR: prereqTree.OR }),
    ...(prereqTree.NOT?.length && { NOT: prereqTree.NOT }),
  };
}

async function scrapePrerequisitePage(deptCode: string, url: string) {
  logger.info(`Scraping prerequisites for ${deptCode}...`);
  const prereqPageText = await fetchWithDelay(url);
  const $ = load(prereqPageText);
  const prereqs = new Map<string, PrerequisiteTree>();
  $("table tbody tr").each(function () {
    const entry = $(this).find("td");
    if ($(entry).length === 3) {
      let courseId = $(entry[prereqFieldLabels.Course]).text().replace(/\s+/g, " ").trim();
      const courseTitle = $(entry[prereqFieldLabels.Title]).text().replace(/\s+/g, " ").trim();
      const prereqList = $(entry[prereqFieldLabels.Prerequisite])
        .text()
        .replace(/\s+/g, " ")
        .trim();
      if (!courseId || !courseTitle || !prereqList) return;
      if (courseId.match(/\* ([&A-Z\d ]+) since/)) {
        courseId = courseId.split("*")[0].trim();
      }
      prereqs.set(courseId, buildPrereqTree(prereqList));
    }
  });
  logger.info(`Finished scraping prerequisites for ${deptCode}`);
  return prereqs;
}

async function scrapePrerequisites() {
  const prereqText = await fetchWithDelay(PREREQ_URL);
  const $ = load(prereqText);
  const deptsToPrereqs = new Map<string, Map<string, PrerequisiteTree>>();
  const deptOptions = $("select[name='dept'] option");
  logger.info(`Found ${deptOptions.length - 1} departments to scrape`);
  for (const deptOption of deptOptions) {
    const dept = $(deptOption).text().trim();
    if (dept === "Select a dept...") continue;
    const url = new URL(PREREQ_URL);
    const params = new URLSearchParams({
      dept: dept,
      action: "view_all",
    });
    url.search = params.toString();
    deptsToPrereqs.set(dept, await scrapePrerequisitePage(dept, url.href));
  }
  return deptsToPrereqs;
}

const deepSortArray = <T extends unknown[]>(array: T): T => sortKeys(array, { deep: true });

function generateGEs(rawCourse: string[]) {
  const maybeGEText = rawCourse.slice(-1)[0];
  const res = {
    isGE1A: false,
    isGE1B: false,
    isGE2: false,
    isGE3: false,
    isGE4: false,
    isGE5A: false,
    isGE5B: false,
    isGE6: false,
    isGE7: false,
    isGE8: false,
    geText: "",
  };
  if (!maybeGEText?.startsWith("(")) return res;
  res.geText = maybeGEText;
  if (res.geText.match(/I[Aa]/)) {
    res.isGE1A = true;
  }
  if (res.geText.match(/I[Bb]/)) {
    res.isGE1B = true;
  }
  if (res.geText.match(/[( ]II[) ]/)) {
    res.isGE2 = true;
  }
  if (res.geText.match(/[( ]III[) ]/)) {
    res.isGE3 = true;
  }
  if (res.geText.match(/IV/)) {
    res.isGE4 = true;
  }
  if (res.geText.match(/V\.?[Aa]/)) {
    res.isGE5A = true;
  }
  if (res.geText.match(/V\.?[Bb]/)) {
    res.isGE5B = true;
  }
  if (res.geText.match(/[( ]VI[) ]/)) {
    res.isGE6 = true;
  }
  if (res.geText.match(/[( ](VII)[) ]/)) {
    res.isGE7 = true;
  }
  if (res.geText.match(/VIII/)) {
    res.isGE8 = true;
  }
  return res;
}

const isPrereq = (x: Prerequisite | PrerequisiteTree): x is Prerequisite => "prereqType" in x;

const prereqToString = (prereq: Prerequisite) =>
  prereq.prereqType === "course" ? prereq.courseId.replaceAll(/ /g, "") : prereq.examName;

function prereqTreeToList(tree: PrerequisiteTree): string[] {
  if (tree.AND) {
    return tree.AND.flatMap((x) => (isPrereq(x) ? prereqToString(x) : prereqTreeToList(x)));
  }
  if (tree.OR) {
    return tree.OR.flatMap((x) => (isPrereq(x) ? prereqToString(x) : prereqTreeToList(x)));
  }
  return [];
}

const norm = (s: string) => s.replace(/\s+/g, " ").trim().normalize("NFKD");
const stripFinalPeriod = (s: string) => s.replace(/\.\s*$/, "");
const textAfterLabel = (txt: string, label: string) => {
  const m = norm(txt).match(new RegExp(`^${label}s?:?\\s*(.+)$`, "i"));
  return m ? stripFinalPeriod(m[1]) : "";
};

const parseUnits = (unitsText: string) => {
  const raw = norm(unitsText)
    .replace(/Units?\./i, "Units")
    .replace(/Units?/i, "")
    .trim();
  if (raw.includes("-")) {
    const [lo, hi] = raw.split("-", 2).map((x) => x.trim());
    return {
      minUnits: unitFormatter.format(Number.parseFloat(lo)),
      maxUnits: unitFormatter.format(Number.parseFloat(hi)),
    };
  }
  const n = Number.parseFloat(raw || "0");
  return {
    minUnits: unitFormatter.format(n),
    maxUnits: unitFormatter.format(n),
  };
};

async function scrapeCoursesInDepartment(meta: {
  db: ReturnType<typeof database>;
  deptCode: string;
  deptPath: string;
  prereqs: Map<string, PrerequisiteTree> | undefined;
}) {
  const updatedAt = new Date();
  const { db, deptCode, deptPath, prereqs } = meta;

  if (!prereqs) {
    logger.warn(`${deptCode} does not have a prerequisite mapping.`);
    logger.warn("Prerequisite data for courses in this department will be empty.");
  }

  logger.info(`Scraping courses for ${deptCode}...`);

  const [school] = await db
    .select({ schoolName: websocSchool.schoolName, departmentName: websocDepartment.deptName })
    .from(websocSchool)
    .innerJoin(websocDepartment, eq(websocDepartment.schoolId, websocSchool.id))
    .where(eq(websocDepartment.deptCode, deptCode))
    .orderBy(desc(websocSchool.year))
    .limit(1);

  if (!school) {
    logger.warn(`Department ${deptCode} not found in WebSoc cache.`);
    logger.warn("The 'schoolName' field will be empty.");
  }
  const schoolName = school?.schoolName ?? "";

  const departmentText = await fetchWithDelay(`${CATALOGUE_URL}${deptPath}`);
  const $ = load(departmentText);
  const departmentName = $("h1.page-title").text().normalize("NFKD").split("(")[0].trim();

  const context: ParseContext = { $, deptCode, schoolName, departmentName, updatedAt, prereqs };

  const courses = deepSortArray(
    $("div.courses .courseblock")
      .toArray()
      .map((el) => parseCourseBlock(context, el))
      .filter((x): x is NonNullable<typeof x> => !!x),
  );

  logger.info(`Fetching courses for ${deptCode} from database...`);
  const dbCourses = deepSortArray(
    await db
      .select()
      .from(course)
      .where(
        inArray(
          course.id,
          courses.map((c) => c.id),
        ),
      )
      .then((rows) => rows.map(({ courseNumeric, ...rest }) => rest)),
  );

  const coursesForInsert = deepSortArray(
    courses.map((c) => ({
      ...c,
      departmentAlias: getDepartmentAlias(c.department),
    })),
  );

  const courseDiff = diffString(dbCourses, coursesForInsert);
  if (!courseDiff.length) {
    logger.info(`No difference found between database and scraped course data for ${deptCode}.`);
  } else {
    console.log(`Difference between database and scraped course data for ${deptCode}:`);
    console.log(courseDiff);
    if (!readlineSync.keyInYNStrict("Is this ok")) {
      logger.error("Cancelling scraping run.");
      exit(1);
    }
  }

  const prereqRows = deepSortArray(
    coursesForInsert
      .map((c) => ({ id: c.id, prerequisiteList: prereqTreeToList(c.prerequisiteTree) }))
      .flatMap((c): (typeof prerequisite.$inferInsert)[] =>
        c.prerequisiteList.map((p) => ({
          prerequisiteId: p,
          dependencyId: c.id,
          dependencyDept: deptCode,
        })),
      ),
  );

  logger.info(`Fetching prerequisites for ${deptCode} from database...`);
  const dbPrereqRows = deepSortArray(
    await db
      .select()
      .from(prerequisite)
      .where(
        inArray(
          prerequisite.dependencyId,
          prereqRows.map((r) => r.dependencyId),
        ),
      )
      .then((rows) => rows.map(({ id, ...rest }) => rest)),
  );

  const prereqDiff = diffString(dbPrereqRows, prereqRows);
  if (!prereqDiff.length) {
    logger.info(
      `No difference found between database and scraped prerequisite data for ${deptCode}.`,
    );
  } else {
    console.log(`Difference between database and scraped prerequisite data for ${deptCode}:`);
    console.log(prereqDiff);
    if (!readlineSync.keyInYNStrict("Is this ok")) {
      logger.error("Cancelling scraping run.");
      exit(1);
    }
  }

  if (!courseDiff.length && !prereqDiff.length) {
    logger.info("Nothing to do.");
    return;
  }

  await db.transaction(async (tx) => {
    if (coursesForInsert.length) {
      await tx.delete(course).where(
        inArray(
          course.id,
          coursesForInsert.map((c) => c.id),
        ),
      );
      await tx.insert(course).values(coursesForInsert);
      await tx.delete(prerequisite).where(
        inArray(
          prerequisite.dependencyId,
          coursesForInsert.map((c) => c.id),
        ),
      );
      if (prereqRows.length) {
        await tx.insert(prerequisite).values(prereqRows).onConflictDoNothing();
      }
    }
  });

  logger.info(`Finished scraping courses for ${deptCode}`);
}

const isCoursePrereqWithId =
  (id: string) =>
  (x: Prerequisite | PrerequisiteTree): x is CoursePrerequisite =>
    isPrereq(x) && x.prereqType === "course" && x.courseId === id;

/**
 * The renaming of I&C SCI 32A to I&C SCI H32 is, as of the 2024-25 academic year, not internally consistent.
 * Some courses that require 32A have been modified to require H32 only, while others still require 32A only.
 * This shim finds all courses that require 32A or H32 (but not both),
 * and adds the other course to the appropriate subtree of the course's prerequisite tree.
 * Since 32A appears only in OR-clauses of courses' prereq trees, this should be a simple change.
 */
async function patchH32(meta: {
  db: ReturnType<typeof database>;
}) {
  const { db } = meta;
  const courses = await db
    .select({ id: course.id, prerequisiteTree: course.prerequisiteTree })
    .from(prerequisite)
    .innerJoin(course, eq(course.id, prerequisite.dependencyId))
    .where(
      or(
        eq(prerequisite.prerequisiteId, "I&CSCI32A"),
        eq(prerequisite.prerequisiteId, "I&CSCIH32"),
      ),
    )
    .then((x) => new Map(x.map(({ id, prerequisiteTree }) => [id, prerequisiteTree])));
  for (const [id, prerequisiteTree] of courses) {
    const newPrereqTree = JSON.parse(JSON.stringify(prerequisiteTree)) as PrerequisiteTree;
    // pathological case; these courses should all have non-empty prerequisite trees
    if (!newPrereqTree.AND) continue;
    // Prereq tree is an AND of one OR, so 32A/H32 must be in this block
    if (newPrereqTree.AND.length === 1) {
      const orNode = newPrereqTree.AND[0] as PrerequisiteTree;
      const node32A = orNode.OR?.find(isCoursePrereqWithId("I&C SCI 32A"));
      const nodeH32 = orNode.OR?.find(isCoursePrereqWithId("I&C SCI H32"));
      // if both exist then don't do anything
      if (!node32A || !nodeH32) {
        const originalNode = (node32A ?? nodeH32) as CoursePrerequisite;
        (newPrereqTree.AND[0] as PrerequisiteTree).OR?.push({
          ...originalNode,
          courseId: originalNode.courseId === "I&C SCI 32A" ? "I&C SCI H32" : "I&C SCI 32A",
        });
      }
    } else {
      const orNodeIndex = newPrereqTree.AND.findIndex(
        (x) =>
          !isPrereq(x) &&
          x.OR?.some(
            (y) =>
              isPrereq(y) &&
              y.prereqType === "course" &&
              (y.courseId === "I&C SCI 32A" || y.courseId === "I&C SCI H32"),
          ),
      );
      const orNode = newPrereqTree.AND[orNodeIndex] as PrerequisiteTree;
      const node32A = orNode.OR?.find(isCoursePrereqWithId("I&C SCI 32A"));
      const nodeH32 = orNode.OR?.find(isCoursePrereqWithId("I&C SCI H32"));
      // if both exist then don't do anything
      if (!node32A || !nodeH32) {
        const originalNode = (node32A ?? nodeH32) as CoursePrerequisite;
        (newPrereqTree.AND[orNodeIndex] as PrerequisiteTree).OR?.push({
          ...originalNode,
          courseId: originalNode.courseId === "I&C SCI 32A" ? "I&C SCI H32" : "I&C SCI 32A",
        });
      }
    }
    await db.update(course).set({ prerequisiteTree: newPrereqTree }).where(eq(course.id, id));
  }
}

async function fetchSchoolsPath(catalogue: string) {
  const schoolsAndPrograms = await fetchWithDelay(`${catalogue}/schoolsandprograms/`);
  const $ = load(schoolsAndPrograms);

  // Extract individual school and program paths
  const schoolAndProgramPaths: string[] = [];
  $("#textcontainer h4 a").each((_, a) => {
    const href = $(a).attr("href");
    if (href?.startsWith("/")) {
      schoolAndProgramPaths.push(href);
    }
  });
  return schoolAndProgramPaths;
}

async function collectProgramPathsFromSchools(): Promise<string[]> {
  const schools = await fetchSchoolsPath(CATALOGUE_URL);
  const programPaths: string[] = [];

  for (const schoolPath of schools) {
    const html = await fetchWithDelay(`${CATALOGUE_URL}${schoolPath}`);
    const $ = load(html);

    const container = $("#majorsminorsandgraduateprogramstextcontainer");
    if (!container.length) {
      continue;
    }
    container.find("ul li a").each((_, a) => {
      const href = $(a).attr("href");
      if (href?.startsWith("/")) {
        programPaths.push(href);
      }
    });
  }
  return Array.from(new Set(programPaths));
}

type SampleYear = {
  year: string;
  curriculum: string[][];
};

/**
 * Extracts a unique ID from the catalogue URL
 * Example: https://catalogue.uci.edu/.../computerscience_bs/ → "computerscience_bs"
 */
function generateProgramId(url: string): string {
  // Extract the last path segment from the URL
  const match = url.match(/\/([^/]+)\/?$/);
  if (!match) {
    logger.warn(`Could not extract ID from URL: ${url}`);
    return "";
  }
  return match[1];
}

/*
 * Transforms the original sample program format to have a Fall, Winter, Spring structure
 * @param sampleYears The original sample years data from the scraper
 * @returns The transformed data with Fall, Winter, Spring structure
 */
function transformToTermStructure(sampleYears: SampleYear[]): {
  sampleProgram: SampleProgramEntry[];
} {
  const transformedProgram: SampleProgramEntry[] = [];

  for (const yearData of sampleYears) {
    const yearTerms: CurriculumTerm[] = [
      { term: "Fall", courses: [] },
      { term: "Winter", courses: [] },
      { term: "Spring", courses: [] },
    ];

    const curriculum = yearData.curriculum;

    for (const row of curriculum) {
      if (row.length >= 1 && row[0].trim()) {
        yearTerms[0].courses.push(row[0].trim());
      }

      if (row.length >= 2 && row[1].trim()) {
        yearTerms[1].courses.push(row[1].trim());
      }

      if (row.length >= 3 && row[2].trim()) {
        yearTerms[2].courses.push(row[2].trim());
      }
    }

    transformedProgram.push({
      year: yearData.year,
      curriculum: yearTerms,
    });
  }

  return {
    sampleProgram: transformedProgram,
  };
}

async function storeSampleProgramsInDB(
  db: ReturnType<typeof database>,
  scrapedPrograms: {
    id: string;
    programName: string;
    sampleProgram: SampleProgramEntry[];
    programNotes: string[];
  }[],
) {
  if (!scrapedPrograms.length) {
    logger.info("No sample programs to store.");
    return;
  }

  logger.info("Fetching sample programs from database...");
  const dbPrograms = await db
    .select()
    .from(sampleProgram)
    .where(
      inArray(
        sampleProgram.id,
        scrapedPrograms.map((program) => program.id),
      ),
    );

  const sortedDbPrograms = sortKeys(dbPrograms, { deep: true });
  const sortedScrapedPrograms = sortKeys(scrapedPrograms, { deep: true });

  const programDiff = diffString(sortedDbPrograms, sortedScrapedPrograms);
  if (!programDiff.length) {
    logger.info("No difference found between database and scraped sample program data.");
    return;
  }

  console.log("Difference between database and scraped sample program data:");
  console.log(programDiff);
  if (!readlineSync.keyInYNStrict("Is this ok")) {
    logger.error("Cancelling sample program update.");
    return;
  }

  await db.transaction(async (tx) => {
    await tx.delete(sampleProgram).where(
      inArray(
        sampleProgram.id,
        scrapedPrograms.map((program) => program.id),
      ),
    );

    await tx.insert(sampleProgram).values(
      scrapedPrograms.map((program) => ({
        id: program.id,
        programName: program.programName,
        sampleProgram: program.sampleProgram,
        programNotes: program.programNotes,
      })),
    );
  });

  logger.info(`Successfully stored ${scrapedPrograms.length} sample programs`);
}

async function scrapeSamplePrograms(programPath: string) {
  const url = `${CATALOGUE_URL}${programPath}`;
  logger.info(`Scraping ${programPath}...`);
  const html = await fetchWithDelay(url);
  const $ = load(html);

  const programName = $("h1.page-title").text().normalize("NFKD").split("(")[0].trim();

  if (!programName) {
    logger.warn(`Could not extract program name from ${url}`);
    return null;
  }

  const sampleProgramContainer = $("#sampleprogramtextcontainer");

  if (!sampleProgramContainer.length) return null;

  const sampleYears: SampleYear[] = [];
  const notes: string[] = [];

  const parseTable = (table: Cheerio<AnyNode>, year: string) => {
    const curriculum: string[][] = [];

    table.find("tr").each((_j, tr_el) => {
      const $tr = $(tr_el);

      if ($tr.hasClass("plangridyear") && !$tr.find("th").text().trim()) return;
      if ($tr.hasClass("plangridterm")) return;

      const rowData: string[] = [];
      $tr.find("th, td").each((_k, cell_el) => {
        rowData.push($(cell_el).text().replace(/\s+/g, " ").trim());
      });

      if (rowData.some((cell) => cell.length > 0)) {
        curriculum.push(rowData);
      }
    });

    sampleYears.push({ year, curriculum });
  };

  if (sampleProgramContainer.children("table.sc_plangrid").length > 0) {
    let currentYear: string | null = null;
    let currentCurriculum: string[][] = [];

    sampleProgramContainer.find("table.sc_plangrid tr").each((_j, tr_el) => {
      const $tr = $(tr_el);

      if ($tr.hasClass("plangridyear")) {
        const yearText = $tr.find("th").text().trim();
        if (yearText) {
          if (currentYear !== null) {
            sampleYears.push({ year: currentYear, curriculum: currentCurriculum });
          }
          currentYear = yearText;
          currentCurriculum = [];
        }
      } else if (!$tr.hasClass("plangridterm")) {
        const rowData: string[] = [];
        $tr.find("td").each((_k, td_el) => {
          rowData.push($(td_el).text().replace(/\s+/g, " ").trim());
        });

        if (rowData.some((cell) => cell.length > 0)) {
          currentCurriculum.push(rowData);
        }
      }
    });

    if (currentYear !== null) {
      sampleYears.push({ year: currentYear, curriculum: currentCurriculum });
    }
  } else {
    sampleProgramContainer.find("h4").each((_i, h4_el) => {
      const yearTitle = $(h4_el).text().trim();
      const contentTable = $(h4_el).next("div").find("table.sc_plangrid");

      if (yearTitle && contentTable.length) {
        logger.debug(`Found H4 "${yearTitle}" with nested table for ${programPath}.`);
        parseTable(contentTable, yearTitle);
      }
    });
  }

  sampleProgramContainer.find("h6:contains('NOTES')").each((_i, h6_el) => {
    $(h6_el)
      .nextUntil("h1, h2, h3, h4, h5, h6, table")
      .filter("p")
      .each((_j, p_el) => {
        notes.push($(p_el).text().trim());
      });
    $(h6_el)
      .next("ol")
      .find("li")
      .each((_j, li_el) => {
        notes.push($(li_el).text().trim());
      });
  });

  sampleProgramContainer.find("p").each((_i, p_el) => {
    const pText = $(p_el).text().trim();
    if (pText.match(/^NOTES\s*:\s*/i)) {
      const remainingText = pText.replace(/^NOTES\s*:\s*/i, "").trim();
      if (remainingText.length > 0) {
        notes.push(remainingText);
      }
      let currentElement = $(p_el).next();
      while (currentElement.length && !currentElement.is("h1, h2, h3, h4, h5, h6, table")) {
        if (currentElement.is("p")) {
          const paragraphContent = currentElement.text().trim();
          if (paragraphContent.length > 0 && !paragraphContent.match(/^NOTES\s*:\s*/i)) {
            notes.push(paragraphContent);
          }
        } else if (currentElement.is("ol")) {
          currentElement.find("li").each((_k, li_el) => {
            notes.push($(li_el).text().trim());
          });
          break;
        }
        currentElement = currentElement.next();
      }
    }
  });

  sampleProgramContainer.find("dl.sc_footnotes").each((_i, dl_el) => {
    $(dl_el)
      .find("dd")
      .each((_j, dd_el) => {
        const noteText = $(dd_el).find("p").text().trim();
        if (noteText.length > 0) {
          notes.push(noteText);
        }
      });
  });

  sampleProgramContainer.find("p").each((_i, p_el) => {
    const pText = $(p_el).text().trim();
    if (
      (pText.startsWith("*") || pText.match(/^<sup>\s*\d+\s*<\/sup>/i)) &&
      !pText.match(/^NOTES\s*:\s*/i)
    ) {
      if (!$(p_el).closest("dl.sc_footnotes").length) {
        notes.push(pText);
      }
    }
  });

  if (notes.length === 0) {
    sampleProgramContainer.find("ol").each((_i, ol_el) => {
      const prevElement = $(ol_el).prev();
      if (
        prevElement.is("table") ||
        prevElement.is("h6") ||
        (prevElement.is("p") && prevElement.text().toLowerCase().includes("notes"))
      ) {
        $(ol_el)
          .find("li")
          .each((_j, li_el) => {
            notes.push($(li_el).text().trim());
          });
      }
    });
  }

  if (sampleYears.length === 0) return null;

  const transformedTermsResult = transformToTermStructure(sampleYears);

  const sampleProgram = sampleYears.map((_, i) => ({
    ...transformedTermsResult.sampleProgram[i],
  }));

  const res = {
    id: generateProgramId(url),
    programName,
    sampleProgram,
    programNotes: notes,
  };

  logger.info(`Successfully scraped ${programName}`);
  return res;
}

async function main() {
  const url = process.env.DB_URL;
  if (!url) throw new Error("DB_URL not found");
  const db = database(url);
  logger.info("course-scraper starting");
  //  let prerequisites = new Map<string, Map<string, PrerequisiteTree>>();
  //  if (existsSync("./prerequisites.json")) {
  //    const stats = statSync("./prerequisites.json");
  //    logger.info(`Found a prerequisite dump on disk (last modified ${stats.mtime}).`);
  //    if (readlineSync.keyInYNStrict("Use this dump?")) {
  //      prerequisites = new Map(
  //        Object.entries(JSON.parse(readFileSync("./prerequisites.json", { encoding: "utf8" }))).map(
  //          ([k, v]) => [k, new Map(Object.entries(v as Record<string, PrerequisiteTree>))],
  //        ),
  //      );
  //      logger.info("Prerequisite dump loaded.");
  //    }
  //  }
  //  if (!prerequisites.size) {
  //    logger.info("Scraping prerequisites...");
  //    prerequisites = await scrapePrerequisites();
  //    writeFileSync(
  //      "./prerequisites.json",
  //      JSON.stringify(
  //        Object.fromEntries(
  //          prerequisites.entries().map(([k, v]) => [k, Object.fromEntries(v.entries())]),
  //        ),
  //      ),
  //    );
  //    logger.info("Wrote prerequisites to file.");
  //  }
  //  logger.info("Scraping courses...");
  //  logger.info("Scraping list of departments...");
  //  const allCoursesText = await fetchWithDelay(`${CATALOGUE_URL}/allcourses`);
  //  const $ = load(allCoursesText);
  //  const departments = new Map(
  //    $("#atozindex")
  //      .children()
  //      .toArray()
  //      .filter((el) => el.type === "tag" && el.name === "ul")
  //      .flatMap((el) => (hasChildren(el) ? Object.values(el.children).filter(hasChildren) : []))
  //      .map((el): [string, string] | undefined =>
  //        el.firstChild?.type === "tag" && el.firstChild.firstChild?.type === "text"
  //          ? [el.firstChild.firstChild.data.split("(")[1].slice(0, -1), el.firstChild.attribs.href]
  //          : undefined,
  //      )
  //      .filter((entry) => !!entry),
  //  );
  //  logger.info(`Found ${departments.size} departments to scrape`);
  //  for (const [deptCode, deptPath] of departments) {
  //    await scrapeCoursesInDepartment({
  //      db,
  //      deptCode,
  //      deptPath,
  //      prereqs: prerequisites.get(deptCode),
  //    });
  //  }
  //  logger.info("Running I&C SCI 32A/H32 shim...");
  //  await patchH32({ db });
  //  logger.info("Starting sample program scraping...");
  const programs = await collectProgramPathsFromSchools();
  logger.info(`Found ${programs.length} programs to scrape`);
  const scrapedPrograms = [];
  for (const programPath of programs) {
    try {
      const sampleProgramData = await scrapeSamplePrograms(programPath);
      if (sampleProgramData) {
        scrapedPrograms.push(sampleProgramData);
      }
    } catch (error) {
      logger.error(`Error processing ${programPath}:`, error);
    }
  }
  await storeSampleProgramsInDB(db, scrapedPrograms);
  logger.info("All done!");
  exit(0);
}

main().then();
