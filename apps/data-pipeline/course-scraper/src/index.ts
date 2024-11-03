import { existsSync, statSync, writeFileSync } from "node:fs";
import { readFileSync } from "node:fs";
import { dirname } from "node:path";
import { exit } from "node:process";
import { fileURLToPath } from "node:url";
import { database } from "@packages/db";
import { desc, eq, inArray } from "@packages/db/drizzle";
import type { Prerequisite, PrerequisiteTree } from "@packages/db/schema";
import { course, prerequisite, websocDepartment, websocSchool } from "@packages/db/schema";
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
    logger.info("Nothing to do.");
    return;
  }
  console.log(`Difference between database and scraped prerequisite data for ${deptCode}:`);
  console.log(prereqDiff);
  if (!readlineSync.keyInYNStrict("Is this ok")) {
    logger.error("Cancelling scraping run.");
    exit(1);
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
          Array.from(prerequisites.entries()).map(([k, v]) => [
            k,
            Object.fromEntries(Array.from(v.entries())),
          ]),
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
  logger.info("All done!");
  exit(0);
}

main().then();
