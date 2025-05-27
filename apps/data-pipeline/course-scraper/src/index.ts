import { existsSync, statSync, writeFileSync } from "node:fs";
import { readFileSync } from "node:fs";
import { dirname } from "node:path";
import { exit } from "node:process";
import { fileURLToPath } from "node:url";
import { database } from "@packages/db";
import { desc, eq, inArray, or } from "@packages/db/drizzle";
import type { CoursePrerequisite, Prerequisite, PrerequisiteTree } from "@packages/db/schema";
import { course, prerequisite, websocDepartment, websocSchool } from "@packages/db/schema";
import { type SampleProgram, sampleProgram } from "@packages/db/schema";
import { sleep } from "@packages/stdlib";
import { load } from "cheerio";
import fetch from "cross-fetch";
import { hasChildren } from "domhandler";
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

const courseMetaOrEmpty = (rawCourse: string[], key: string) =>
  rawCourse
    .find((x) => x.startsWith(key))
    ?.replace(key, "")
    .trim() ?? "";

const parseUnits = (unitString: string) =>
  unitString.includes("-")
    ? {
        minUnits: unitFormatter.format(Number.parseFloat(unitString.split("-", 2)[0])),
        maxUnits: unitFormatter.format(Number.parseFloat(unitString.split("-", 2)[1])),
      }
    : {
        minUnits: unitFormatter.format(Number.parseFloat(unitString)),
        maxUnits: unitFormatter.format(Number.parseFloat(unitString)),
      };

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

function parseRawCourse(meta: {
  rawCourse: string[];
  school: string;
  department: string;
  departmentName: string;
  prereqs: Map<string, PrerequisiteTree> | undefined;
  updatedAt: Date;
}): typeof course.$inferInsert {
  const { rawCourse, school, department, departmentName, prereqs, updatedAt } = meta;
  const deptAndCourseNumber = rawCourse[0].trim().split(". ")[0].trim();
  const title = rawCourse[0].trim().split(". ").slice(1, -1).join(". ").trim();
  const units =
    rawCourse[0]
      .trim()
      .split(". ")
      .slice(2)
      .slice(-1)[0]
      ?.replace(/Units?\./, "")
      .trim() ?? "0";
  const courseNumber = deptAndCourseNumber.replace(department, "").trim();
  const courseNumeric = Number.parseInt(courseNumber.replaceAll(/[A-Z]/g, ""), 10);
  return {
    id: deptAndCourseNumber.replaceAll(/ /g, ""),
    department,
    courseNumber,
    school,
    title,
    courseLevel: courseNumeric < 100 ? "LowerDiv" : courseNumeric < 200 ? "UpperDiv" : "Graduate",
    ...parseUnits(units),
    description: rawCourse[1],
    departmentName,
    prerequisiteTree: prereqs?.get(deptAndCourseNumber) ?? {},
    prerequisiteText: courseMetaOrEmpty(rawCourse, "Prerequisite: "),
    repeatability: courseMetaOrEmpty(rawCourse, "Repeatability: "),
    gradingOption: courseMetaOrEmpty(rawCourse, "Grading Option: "),
    concurrent: courseMetaOrEmpty(rawCourse, "Concurrent with "),
    sameAs: courseMetaOrEmpty(rawCourse, "Same as "),
    restriction: courseMetaOrEmpty(rawCourse, "Restriction: "),
    overlap: courseMetaOrEmpty(rawCourse, "Overlaps with "),
    corequisites: courseMetaOrEmpty(rawCourse, "Corequisite: "),
    ...generateGEs(rawCourse),
    updatedAt,
  };
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
  const courseText = $("div.courses")
    .children()
    .map(function () {
      return $(this)
        .text()
        .split("\n")
        .map((x) => x.trim().normalize("NFKD"))
        .filter((x) => x.length)
        .concat([""]);
    })
    .toArray()
    .slice(3);
  const rawCourses: string[][] = [];
  let accumulator: string[] = [];
  for (const line of courseText) {
    if (!line.length) {
      rawCourses.push([...accumulator]);
      accumulator = [];
      continue;
    }
    accumulator.push(line);
  }
  const courses = deepSortArray(
    rawCourses.map((rawCourse) =>
      parseRawCourse({
        rawCourse,
        school: schoolName,
        department: deptCode,
        departmentName,
        prereqs,
        updatedAt,
      }),
    ),
  );
  logger.info(`Fetching courses for ${deptCode} from database...`);
  const dbCourses = deepSortArray(
    await db
      .select()
      .from(course)
      .where(
        inArray(
          course.id,
          courses.map((course) => course.id),
        ),
      )
      .then((rows) => rows.map(({ courseNumeric, updatedAt, ...rest }) => rest)),
  );
  const courseDiff = diffString(dbCourses, courses);
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
    courses
      .map((course) => ({
        id: course.id,
        prerequisiteList: prereqTreeToList(course.prerequisiteTree),
      }))
      .flatMap((course): (typeof prerequisite.$inferInsert)[] =>
        course.prerequisiteList.map((prereq) => ({
          prerequisiteId: prereq,
          dependencyId: course.id,
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
          prereqRows.map((prereq) => prereq.dependencyId),
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
    if (courses.length) {
      await tx.delete(course).where(
        inArray(
          course.id,
          courses.map((course) => course.id),
        ),
      );
      await tx.insert(course).values(courses);
      await tx.delete(prerequisite).where(
        inArray(
          prerequisite.dependencyId,
          courses.map((course) => course.id),
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
  const html = await fetchWithDelay(`${catalogue}/schoolsandprograms/`);
  const $ = load(html);
  const paths: string[] = [];
  $("#textcontainer h4 a").each((_, a) => {
    const href = $(a).attr("href");
    if (href?.startsWith("/")) {
      paths.push(href);
    }
  });
  return paths;
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

/*
 * Transforms the original sample program format to have a Fall, Winter, Spring structure
 * @param sampleYears The original sample years data from the scraper
 * @returns The transformed data with Fall, Winter, Spring structure
 */
function transformToTermStructure(sampleYears: Array<{ year: string; curriculum: string[][] }>): {
  sampleProgram: Array<{ Fall: string[]; Winter: string[]; Spring: string[] }>;
} {
  const transformedProgram: Array<{ Fall: string[]; Winter: string[]; Spring: string[] }> = [];

  for (const yearData of sampleYears) {
    const yearTerms: { Fall: string[]; Winter: string[]; Spring: string[] } = {
      Fall: [],
      Winter: [],
      Spring: [],
    };

    const curriculum = yearData.curriculum;

    for (const row of curriculum) {
      if (row.length >= 1 && row[0].trim()) {
        yearTerms.Fall.push(row[0].trim());
      }

      if (row.length >= 2 && row[1].trim()) {
        yearTerms.Winter.push(row[1].trim());
      }

      if (row.length >= 3 && row[2].trim()) {
        yearTerms.Spring.push(row[2].trim());
      }
    }

    transformedProgram.push(yearTerms);
  }

  return {
    sampleProgram: transformedProgram,
  };
}

async function storeSampleProgramsInDB(
  db: ReturnType<typeof database>,
  scrapedPrograms: Array<{ programName: string; sampleProgram: SampleProgram[] }>,
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
        sampleProgram.programName,
        scrapedPrograms.map((program) => program.programName),
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
    // Delete existing programs
    await tx.delete(sampleProgram).where(
      inArray(
        sampleProgram.programName,
        scrapedPrograms.map((program) => program.programName),
      ),
    );

    // Insert new programs (only the two fields that exist)
    await tx.insert(sampleProgram).values(
      scrapedPrograms.map((program) => ({
        programName: program.programName,
        sampleProgram: program.sampleProgram,
      })),
    );
  });

  logger.info(`Successfully stored ${scrapedPrograms.length} sample programs`);
}

async function scrapeSamplePrograms(programPath: string) {
  const url = `${CATALOGUE_URL}${programPath}`;
  const html = await fetchWithDelay(url);
  const $ = load(html);

  const programName = $("h1.page-title").text().normalize("NFKD").split("(")[0].trim();
  const sampleProgramContainer = $("#sampleprogramtextcontainer");

  const sampleYears: { year: string; curriculum: string[][] }[] = [];

  if (!sampleProgramContainer.length) {
    return;
  }

  const mainProgramTable = sampleProgramContainer.find("table.sc_plangrid");

  if (sampleProgramContainer.children("table.sc_plangrid").length > 0) {
    let currentYear: string | null = null;
    let currentCurriculum: string[][] = [];

    mainProgramTable.find("tr").each((_j, tr_el) => {
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
      } else if ($tr.hasClass("plangridterm")) {
      } else {
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
      const contentDiv = $(h4_el).next("div");
      const contentTable = contentDiv.find("table.sc_plangrid");

      if (yearTitle && contentTable.length) {
        logger.debug(`Found H4 "${yearTitle}" with nested table for ${programPath}.`);
        const curriculum: string[][] = [];

        contentTable.find("tr").each((_j, tr_el) => {
          const $tr = $(tr_el);

          if ($tr.hasClass("plangridyear") && !$tr.find("th").text().trim()) {
            return;
          }
          if ($tr.hasClass("plangridterm")) {
            return;
          }

          const rowData: string[] = [];
          $tr.find("th, td").each((_k, cell_el) => {
            rowData.push($(cell_el).text().replace(/\s+/g, " ").trim());
          });
          if (rowData.some((cell) => cell.length > 0)) {
            curriculum.push(rowData);
          }
        });
        sampleYears.push({ year: yearTitle, curriculum });
      }
    });
  }
  if (sampleYears.length > 0) {
    // const res = [{ programName: programName, sampleProgram: sampleYears }];
    // console.log(JSON.stringify(res, null, 2));
    const transformedTermsResult = transformToTermStructure(sampleYears);
    const combinedProgram = [];

    for (let i = 0; i < sampleYears.length; i++) {
      combinedProgram.push({
        year: sampleYears[i].year,
        ...transformedTermsResult.sampleProgram[i],
      });
    }

    const res = {
      programName: programName,
      sampleProgram: combinedProgram,
    };
    console.log(JSON.stringify(res, null, 2));
    return res;
  }
  return null;
}

async function main() {
  const url = process.env.DB_URL;
  if (!url) throw new Error("DB_URL not found");
  const db = database(url);
  logger.info("course-scraper starting");
  let prerequisites = new Map<string, Map<string, PrerequisiteTree>>();
  if (existsSync("./prerequisites.json")) {
    const stats = statSync("./prerequisites.json");
    logger.info(`Found a prerequisite dump on disk (last modified ${stats.mtime}).`);
    if (readlineSync.keyInYNStrict("Use this dump?")) {
      prerequisites = new Map(
        Object.entries(JSON.parse(readFileSync("./prerequisites.json", { encoding: "utf8" }))).map(
          ([k, v]) => [k, new Map(Object.entries(v as Record<string, PrerequisiteTree>))],
        ),
      );
      logger.info("Prerequisite dump loaded.");
    }
  }
  if (!prerequisites.size) {
    logger.info("Scraping prerequisites...");
    prerequisites = await scrapePrerequisites();
    writeFileSync(
      "./prerequisites.json",
      JSON.stringify(
        Object.fromEntries(
          prerequisites.entries().map(([k, v]) => [k, Object.fromEntries(v.entries())]),
        ),
      ),
    );
    logger.info("Wrote prerequisites to file.");
  }
  logger.info("Scraping courses...");
  logger.info("Scraping list of departments...");
  const allCoursesText = await fetchWithDelay(`${CATALOGUE_URL}/allcourses`);
  const $ = load(allCoursesText);
  const departments = new Map(
    $("#atozindex")
      .children()
      .toArray()
      .filter((el) => el.type === "tag" && el.name === "ul")
      .flatMap((el) => (hasChildren(el) ? Object.values(el.children).filter(hasChildren) : []))
      .map((el): [string, string] | undefined =>
        el.firstChild?.type === "tag" && el.firstChild.firstChild?.type === "text"
          ? [el.firstChild.firstChild.data.split("(")[1].slice(0, -1), el.firstChild.attribs.href]
          : undefined,
      )
      .filter((entry) => !!entry),
  );
  logger.info(`Found ${departments.size} departments to scrape`);
  for (const [deptCode, deptPath] of departments) {
    await scrapeCoursesInDepartment({
      db,
      deptCode,
      deptPath,
      prereqs: prerequisites.get(deptCode),
    });
  }
  logger.info("Running I&C SCI 32A/H32 shim...");
  await patchH32({ db });

  // const programs = await collectProgramPathsFromSchools();
  // for (const program of programs) {
  //   console.log(await scrapeSamplePrograms(program));
  // }

  logger.info("Starting sample program scraping...");
  const programs = await collectProgramPathsFromSchools();
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

  // Store all scraped programs at once (following course scraper pattern)
  await storeSampleProgramsInDB(db, scrapedPrograms);

  logger.info("All done!");
  exit(0);
}

main().then();
