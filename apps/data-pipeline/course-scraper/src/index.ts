import { existsSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { exit } from "node:process";
import { fileURLToPath } from "node:url";
import { database } from "@packages/db";
import { desc, eq, inArray, or } from "@packages/db/drizzle";
import type {
  CoursePrerequisite,
  Prerequisite,
  PrerequisiteTree,
  RequirementPrerequisite,
} from "@packages/db/schema";
import {
  course,
  courseView,
  prerequisite,
  websocDepartment,
  websocSchool,
} from "@packages/db/schema";
import { DEPT_TO_ALIAS, type DeptCode, orNull, sleep } from "@packages/stdlib";
import { load } from "cheerio";
import fetch from "cross-fetch";
import type { Element as DomElement } from "domhandler";
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
  const repeatabilityData = parseRepeatability(repeatText);

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
    repeatabilityTimes: repeatabilityData.repeatabilityTimes,
    repeatabilityType: repeatabilityData.unit,
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

/**
 * Parses a course/exam reference that may carry any combination of "( coreq )" and
 * "( min grade = X )" / "( min score = X )" annotations, in either order — e.g.
 * "BIO SCI D104 ( coreq ) ( min grade = D- )" or the reverse ordering. Previously,
 * two separate fixed-order regexes each matched only one annotation on its own, so a
 * course with both annotations together (confirmed in real data: DRAMA 10, BIO SCI
 * D103/D104, and several French/German/Chemistry/Physics corequisite sequences)
 * matched neither and was silently dropped. Returns undefined — so the caller can
 * fall through to other parsing strategies — if the base isn't followed by at least
 * one recognized annotation, or if any annotation present isn't recognized (e.g.
 * "( recommended )"); we don't guess at partial data.
 */
function parseAnnotatedCourseOrExam(prereq: string): Prerequisite | undefined {
  const match = prereq.match(/^([^()]+?)((?:\s*\([^()]*\))+)$/);
  if (!match) return undefined;

  const base = match[1].trim();
  const annotations = [...match[2].matchAll(/\(([^()]*)\)/g)].map((m) => m[1].trim());

  let coreq = false;
  let minGrade: string | undefined;
  let isExam = false;

  for (const ann of annotations) {
    if (ann === "coreq") {
      coreq = true;
      continue;
    }
    const gradeMatch = ann.match(/^min (\S+) = (\S{1,2})$/);
    if (gradeMatch) {
      if (gradeMatch[1] === "grade") {
        minGrade = gradeMatch[2];
      } else {
        isExam = true;
        minGrade = gradeMatch[2];
      }
      continue;
    }
    // An annotation we don't recognize — bail out entirely rather than guessing.
    return undefined;
  }

  if (isExam) {
    return { prereqType: "exam", examName: base, ...(minGrade ? { minGrade } : {}) };
  }
  return coreq
    ? { prereqType: "course", coreq: true, courseId: base, ...(minGrade ? { minGrade } : {}) }
    : { prereqType: "course", coreq: false, courseId: base, ...(minGrade ? { minGrade } : {}) };
}

/**
 * Sub-classifies genuine `requirement` text (see issue #438) into one of three groups,
 * based on *how* the requirement is attained rather than just its surface wording —
 * and extracts the substantive value out of the fixed template wrapping it:
 *
 * - "status" — a fixed fact about the student (standing, major, school), verified
 *   directly off existing enrollment records; nothing to demonstrate or substitute.
 *   e.g. "UPPER DIVISION STANDING ONLY" -> value "UPPER DIVISION".
 * - "qualification" — competency an authority must confirm, via whichever method
 *   they accept (a placement exam is just the standardized default; "authorization"
 *   covers any other accepted method, e.g. demonstrated home use of a language).
 *   The method name itself is kept as the value (never trimmed away entirely) since
 *   "PLACEMENT EXAM" and "AUTHORIZATION" are two different accepted methods, not
 *   interchangeable synonyms — collapsing both to the same generic value would erase
 *   that distinction.
 * - "completion" — something already satisfied and verified elsewhere (e.g. the
 *   lower-division writing requirement), closer in spirit to this file's existing
 *   GE flags than to an enrollment-time gate. No fixed template to strip here — the
 *   whole phrase is the content, so value is the text unchanged.
 *
 * Returns undefined for text that doesn't match any of the three — that's expected
 * and fine; not every requirement clause needs to fit one of these groups, and an
 * unmatched clause still gets stored as plain requirement text either way.
 */
type RequirementCategory = "status" | "qualification" | "completion";
type RequirementExtraction = { category: RequirementCategory; value: string };

// Order matters: standing is checked before the major pattern so a standing clause
// can never be mistaken for a (nonexistent) "STANDING" major. CAMPUSWIDE HONORS is
// pulled out into its own named entry now that it's a confirmed real case (the
// catch-all at the end already extracted it correctly, but naming it explicitly here
// means anything that still falls through to the catch-all going forward is
// guaranteed genuinely novel, not something already confirmed).
const STATUS_EXTRACTORS: RegExp[] = [
  // standing: "UPPER DIVISION STANDING ONLY" -> "UPPER DIVISION"
  /^(FRESHM[AE]N|SOPHOMORE|JUNIOR|SENIOR|LOWER DIVISION|UPPER DIVISION|GRADUATE)\s+STANDING\s+ONLY$/i,
  // confirmed program/cohort case: "CAMPUSWIDE HONORS ONLY" -> "CAMPUSWIDE HONORS"
  /^(CAMPUSWIDE HONORS)\s+ONLY$/i,
  // school: "SCHOOL OF I&C SCI ONLY" -> "I&C SCI"
  /^SCHOOL OF (.+?)\s+ONLY$/i,
  // major: "COMPUTER SCI & ENGR MAJORS ONLY" -> "COMPUTER SCI & ENGR". Non-greedy up
  // to the fixed " MAJOR(S) ONLY" suffix, so this is safe even when the major name
  // itself contains "AND" (e.g. "ENVIRON SCI AND POL MAJORS ONLY" -> "ENVIRON SCI AND
  // POL") — we're extracting from an already-atomic string, not splitting on that
  // word the way splitOnOr's word-boundary check does (see issue #439).
  /^(.+?)\s+MAJORS?\s+ONLY$/i,
  // catch-all: any other fixed program/cohort-membership clause ending in "ONLY" that
  // doesn't fit any named template above. Same underlying shape as major/school (a
  // fixed fact verified off existing enrollment records, nothing to demonstrate),
  // just not yet a confirmed, named case. Checked last so it never preempts a more
  // precise match above.
  /^(.+?)\s+ONLY$/i,
];

function extractRequirementInfo(text: string): RequirementExtraction | undefined {
  for (const pattern of STATUS_EXTRACTORS) {
    const m = text.match(pattern);
    if (m) return { category: "status", value: m[1].trim() };
  }

  if (/^PLACEMENT EXAM$/i.test(text)) {
    return { category: "qualification", value: text };
  }
  if (/^AUTHORIZATION\b/i.test(text)) {
    // Strip a trailing explanatory parenthetical if present, but keep "AUTHORIZATION"
    // itself — trimming it away entirely would make this indistinguishable from
    // "PLACEMENT EXAM" once only the value is looked at, erasing which of the two
    // accepted methods this actually is.
    const withoutParenthetical = text.replace(/\s*\(.*\)\s*$/, "").trim();
    return { category: "qualification", value: withoutParenthetical || text };
  }

  if (/WRITING$/i.test(text)) {
    return { category: "completion", value: text };
  }

  return undefined;
}

function parsePrerequisite(prereq: string): Prerequisite | undefined {
  if (/\(\s*recommended\s*\)/i.test(prereq)) {
    logger.info(`IGNORING RECOMMENDED PREREQUISITE: ${JSON.stringify(prereq)}`);
    return undefined;
  }

  const annotated = parseAnnotatedCourseOrExam(prereq);
  if (annotated) return annotated;

  if (prereq.match(/^AP.*|^[A-Z0-9&/\s]+\d\S*$/)) {
    return prereq.startsWith("AP")
      ? { prereqType: "exam", examName: prereq }
      : { prereqType: "course", coreq: false, courseId: prereq };
  }

  // Not a course or exam reference in the shapes handled above. Before treating this
  // as genuine registrar prose (see issue #438), check whether it still contains a
  // leftover course-annotation fragment — e.g. "( coreq )" or "( min grade" — which
  // means this was meant to be a course reference with an annotation
  // parseAnnotatedCourseOrExam didn't recognize (e.g. "( recommended ) ( coreq )").
  // Real requirement text observed so far (standing/major/writing/exam clauses) never
  // contains these tokens, so their presence is a strong signal of a remaining parser
  // gap, not free text. Flag it distinctly so it doesn't blend in with genuine
  // captures and get mistaken for working as intended. Deliberately not run through
  // extractRequirementInfo — this isn't trusted as genuine requirement text, so it
  // shouldn't be tagged as though it were.
  if (/\(\s*(coreq|min\s+(grade|score))\b/i.test(prereq)) {
    logger.warn(
      `POSSIBLE PARSE FAILURE (leftover course annotation, likely not genuine requirement text): ${JSON.stringify(prereq)}`,
    );
    return { prereqType: "requirement", requirement: prereq };
  }

  // Genuine registrar prose describing a non-course requirement (major/standing
  // restriction, writing requirement, placement exam, etc). Capture it verbatim
  // instead of silently dropping it — see issue #438. A very short fragment is more
  // likely a leftover parser bug than genuine registrar text, so flag those distinctly
  // for investigation rather than treating them as clean requirement text — and don't
  // run the (likely-garbage) fragment through extractRequirementInfo either.
  if (prereq.length < 3) {
    logger.warn(
      `SUSPICIOUS SHORT REQUIREMENT TEXT (possible parser bug): ${JSON.stringify(prereq)}`,
    );
    return { prereqType: "requirement", requirement: prereq };
  }

  const extracted = extractRequirementInfo(prereq);
  logger.info(
    `REQUIREMENT TEXT CAPTURED${extracted ? ` [${extracted.category}: ${extracted.value}]` : ""}: ${JSON.stringify(prereq)}`,
  );
  // requirement is dropped once category+value are known — they're sufficient on
  // their own. Kept only when extraction fails (e.g. "CAMPUSWIDE HONORS ONLY"), since
  // otherwise that leaf would carry no information at all — the exact silent data
  // loss issue #438 was written to fix, just one layer deeper.
  return extracted
    ? { prereqType: "requirement", ...extracted }
    : { prereqType: "requirement", requirement: prereq };
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

  const withoutNo = prereq.replace(/^NO\s+/, "").trim();

  // A course/exam antirequisite carrying an annotation, e.g. "NO MATH H2D ( min grade
  // = C )" — antiCourseMatch above can't handle parentheses at all. Same shape of gap
  // as the original DRAMA 10 / BIO SCI D103-D104 issue, just on the "NO"-prefixed side
  // — reuse the same parser rather than duplicating its logic.
  const annotated = parseAnnotatedCourseOrExam(withoutNo);
  if (annotated) {
    return annotated;
  }

  // "NO REPEATS ALLOWED ..." isn't a real antirequisite (it says nothing about a
  // different course you must not have taken) — it's a repeatability note that
  // happens to start with "NO", already captured separately (and more usefully, as
  // structured data) via parseRepeatability -> repeatability/repeatabilityTimes/
  // repeatabilityType. Drop it quietly rather than warning or duplicating it here.
  if (/^NO REPEATS ALLOWED\b/.test(prereq)) {
    return undefined;
  }

  // A negated status restriction, e.g. "NO PSYCHOLOGY MAJORS ONLY" — this doesn't mean
  // "don't take this course," it means "don't be this major." Structurally this is
  // exactly the negation of ordinary requirement text: "PSYCHOLOGY MAJORS ONLY" alone
  // would extract cleanly to { category: "status", value: "PSYCHOLOGY" } via
  // extractRequirementInfo. Reusing that here (on the "NO "-stripped text) gives the
  // correctly-shaped leaf to push into the NOT branch, representing "must not be a
  // Psychology major" rather than treating it as an unparseable course reference.
  const extracted = extractRequirementInfo(withoutNo);
  if (extracted) {
    logger.info(
      `NEGATED REQUIREMENT CAPTURED [${extracted.category}: ${extracted.value}]: ${JSON.stringify(prereq)}`,
    );
    return { prereqType: "requirement", ...extracted };
  }

  logger.warn(`UNPARSED ANTIREQUISITE: ${JSON.stringify(prereq)}`);
  return undefined;
}

// EXPERIMENT: reverted to doc10's simple, non-recursive shape (no nested-paren
// handling) to test the hypothesis that splitOnOr's word-boundary fix is the only
// change actually needed — see issue #439 discussion. Logging added so real runs can
// be compared directly: this leaf never recurses, so if a "(" appears in a string
// passed to buildORLeaf below, it will fail to parse as a course/exam/requirement in
// the shape you'd expect, and the log will show exactly that instead of a silent
// structural difference.
function buildANDLeaf(prereqTree: PrerequisiteTree, prereq: string) {
  logger.info(`AND LEAF INPUT: ${JSON.stringify(prereq)}`);
  if (prereq.startsWith("NO")) {
    const req = parseAntirequisite(prereq);
    logger.info(`AND LEAF PARSED (antirequisite): ${JSON.stringify(req)}`);
    if (req) {
      prereqTree.NOT?.push(req);
    }
  } else {
    const req = parsePrerequisite(prereq);
    logger.info(`AND LEAF PARSED: ${JSON.stringify(req)}`);
    if (req) {
      prereqTree.AND?.push(req);
    }
  }
}

// EXPERIMENT: reverted to doc10's simple shape — no recursive nested-OR handling.
// If real data ever hands this a string like "( B OR C )" (a parenthesized group
// nested inside an outer OR-list), this version will NOT recurse into it the way the
// pre-session code did; it'll be passed straight to parseAntirequisite/
// parsePrerequisite, which will most likely fail to produce a clean match (parens
// aren't expected there) and fall through to the requirement-text/parse-failure
// paths. The logging below is specifically so that outcome is visible if it happens,
// rather than silently different.
function buildORLeaf(prereqTree: PrerequisiteTree, prereq: string) {
  logger.info(`PREREQ INPUT: ${JSON.stringify(prereq)}`);

  if (prereq.startsWith("(") && prereq.endsWith(")")) {
    const nestedTree: PrerequisiteTree = { OR: [] };
    const orReqs = splitOnOr(prereq.slice(1, -1).trim());
    for (const orReq of orReqs) {
      buildORLeaf(nestedTree, orReq.trim());
    }
    if (nestedTree.OR?.length) {
      prereqTree.OR?.push(nestedTree.OR.length === 1 ? nestedTree.OR[0] : nestedTree);
    }
    return;
  }

  const req: Prerequisite | undefined = prereq.startsWith("NO")
    ? parseAntirequisite(prereq)
    : parsePrerequisite(prereq);

  logger.info(`PARSED RESULT: ${JSON.stringify(req)}`);

  if (req) {
    prereqTree.OR?.push(req);
  }
}

const BOILERPLATE_STRINGS = ["Display all prerequisites on file submitted by department."];

function splitOnOr(prereqList: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = "";

  for (let i = 0; i < prereqList.length; i++) {
    const char = prereqList[i];

    if (char === "(") depth++;
    else if (char === ")") depth--;

    // Word boundary required both before and after the token — otherwise "OR" inside
    // a longer word (e.g. "JUNIOR", "SENIOR") gets mistaken for the separator; this is
    // the confirmed cause of the "JUNI"/"SENI" fragments — see issue #439. This is the
    // one fix in this experiment kept exactly as before, since it's the only one with
    // direct before/after log evidence proving it's necessary.
    const precededByLetter = i > 0 && /[A-Za-z]/.test(prereqList[i - 1]);
    if (depth === 0 && !precededByLetter && prereqList.slice(i).match(/^OR\b/)) {
      parts.push(current.trim());
      current = "";
      i += 1; // skip "OR"
      continue;
    }

    current += char;
  }

  if (current.trim()) parts.push(current.trim());
  logger.info(`splitOnOr input: ${JSON.stringify(prereqList)}`);
  logger.info(`splitOnOr output: ${JSON.stringify(parts)}`);
  return parts;
}

function buildPrereqTree(prereqList: string): PrerequisiteTree {
  if (BOILERPLATE_STRINGS.some((s) => prereqList.includes(s))) {
    return {};
  }
  const prereqTree: PrerequisiteTree = { AND: [], NOT: [] };
  // EXPERIMENT: reverted to doc10's naive split — no depth tracking, no word-boundary
  // check. This means a word containing "AND" next to a non-letter (e.g. "STANDARD",
  // "COMMAND") WOULD be vulnerable to the same corruption #439 fixed for "OR", if such
  // a word ever appears in real prereqList text — logged here so that's visible if it
  // happens during testing, rather than silently corrupting data unnoticed.
  const prereqs = prereqList.split(/ AND /).map((prereq) => prereq.trim());
  logger.info(`NAIVE AND-split input: ${JSON.stringify(prereqList)}`);
  logger.info(`NAIVE AND-split output: ${JSON.stringify(prereqs)}`);
  for (const prereq of prereqs) {
    if (prereq[0] === "(") {
      const orReqs = splitOnOr(prereq.slice(1, -1).trim());
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
  const skippedCourseIds: string[] = [];
  $("table tbody tr").each(function () {
    const entry = $(this).find("td");
    if ($(entry).length === 3) {
      let courseId = $(entry[prereqFieldLabels.Course]).text().replace(/\s+/g, " ").trim();
      const courseTitle = $(entry[prereqFieldLabels.Title]).text().replace(/\s+/g, " ").trim();
      const prereqCell = $(entry[prereqFieldLabels.Prerequisite]);
      const prereqCellHtml = prereqCell.html() ?? "";
      const prereqList = prereqCell
        .contents()
        .map((_, node) => $(node).text())
        .get()
        .join(" ")
        .replace(/\s+/g, " ")
        .trim();
      if (!courseId || !courseTitle || !prereqList) return;
      if (courseId.match(/\* ([&A-Z\d ]+) since/)) {
        courseId = courseId.split("*")[0].trim();
      }
      logger.info(`RAW PREREQ LIST for ${courseId}: ${JSON.stringify(prereqList)}`);
      logger.info(`RAW PREREQ HTML for ${courseId}: ${JSON.stringify(prereqCellHtml)}`);
      if (!isBalancedPrereqText(prereqList)) {
        logger.warn(
          `TRUNCATED PREREQ SOURCE for ${courseId}: unbalanced parentheses, likely cut off ` +
            `by the registrar's page. Skipping to avoid building a corrupted prerequisite tree. ` +
            `Raw text: ${JSON.stringify(prereqList)}`,
        );
        skippedCourseIds.push(courseId);
        return;
      }
      prereqs.set(courseId, buildPrereqTree(prereqList));
    }
  });
  if (skippedCourseIds.length) {
    logger.warn(
      `${deptCode}: skipped ${skippedCourseIds.length} course(s) with truncated prerequisite ` +
        `source: ${skippedCourseIds.join(", ")}`,
    );
  }
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
  if (maybeGEText.match(/\bI[Aa]\b/)) {
    res.isGE1A = true;
  }
  if (maybeGEText.match(/\bI[Bb]\b/)) {
    res.isGE1B = true;
  }
  if (maybeGEText.match(/\bII\b/)) {
    res.isGE2 = true;
  }
  if (maybeGEText.match(/\bIII\b/)) {
    res.isGE3 = true;
  }
  if (maybeGEText.match(/\bIV\b/)) {
    res.isGE4 = true;
  }
  if (maybeGEText.match(/\bV\.?[Aa]\b/)) {
    res.isGE5A = true;
  }
  if (maybeGEText.match(/\bV\.?[Bb]\b/)) {
    res.isGE5B = true;
  }
  if (maybeGEText.match(/\bVI\b/)) {
    res.isGE6 = true;
  }
  if (maybeGEText.match(/\bVII\b/)) {
    res.isGE7 = true;
  }
  if (maybeGEText.match(/\bVIII\b/)) {
    res.isGE8 = true;
  }
  if (
    res.isGE1A ||
    res.isGE1B ||
    res.isGE2 ||
    res.isGE3 ||
    res.isGE4 ||
    res.isGE5A ||
    res.isGE5B ||
    res.isGE6 ||
    res.isGE7 ||
    res.isGE8
  ) {
    res.geText = maybeGEText;
  }
  return res;
}

function parseRepeatability(repeatText: string): {
  repeatabilityTimes: number | null;
  unit: "credit_hours" | "times" | null;
} {
  const timesMatch1 = /May be taken for credit (\d+) time(s)?/.exec(repeatText);
  const timesMatch2 = /May be taken (\d+) time(s)? */.exec(repeatText);
  const unitsMatch = /May be taken for credit for (\d+) units/.exec(repeatText);

  if (timesMatch1) {
    return {
      repeatabilityTimes: Number.parseInt(timesMatch1[1], 10),
      unit: "times",
    };
  } else if (timesMatch2) {
    return {
      repeatabilityTimes: Number.parseInt(timesMatch2[1], 10),
      unit: "times",
    };
  } else if (unitsMatch) {
    return {
      repeatabilityTimes: Number.parseInt(unitsMatch[1], 10),
      unit: "credit_hours",
    };
  } else if (repeatText.toLowerCase().includes("unlimited")) {
    return {
      repeatabilityTimes: null,
      unit: null,
    };
  } /*else if (repeatText.trim() !== "") {
    throw new Error(`Unrecognized repeatability text: ${repeatText}`);
  }*/

  return {
    repeatabilityTimes: 0,
    unit: "times",
  };
}

const isPrereq = (x: Prerequisite | PrerequisiteTree): x is Prerequisite => "prereqType" in x;

// Only course/exam prereqs ever reach here — a `requirement` leaf is filtered out by the
// caller before this is invoked, since it has no courseId/examName to contribute to the
// junction table.
const prereqToString = (prereq: Exclude<Prerequisite, RequirementPrerequisite>) =>
  prereq.prereqType === "course" ? prereq.courseId.replaceAll(/ /g, "") : prereq.examName;

// A "requirement" leaf (free-text non-course clause, e.g. "UPPER DIVISION STANDING ONLY")
// has no courseId/examName and isn't a dependency edge — it belongs in prerequisiteTree
// for display, but must be excluded here so it doesn't pollute the prerequisite junction
// table or crash prereqToString.
function prereqTreeToList(tree: PrerequisiteTree): string[] {
  const toEntry = (x: Prerequisite | PrerequisiteTree): string[] => {
    if (!isPrereq(x)) return prereqTreeToList(x);
    return x.prereqType === "requirement" ? [] : [prereqToString(x)];
  };
  if (tree.AND) {
    return tree.AND.flatMap(toEntry);
  }
  if (tree.OR) {
    return tree.OR.flatMap(toEntry);
  }
  return [];
}

/**
 * Detects prerequisite source text that was cut off mid-clause (e.g. by a server-side
 * truncation bug on the registrar's page, as observed for PSYCH 173A). A well-formed
 * prereqList should have balanced parentheses and should never dip below zero depth.
 * This is a cheap sanity check, not a full grammar validator — it won't catch every
 * possible corruption, but it reliably catches dangling/truncated clauses.
 */
function isBalancedPrereqText(prereqList: string): boolean {
  let depth = 0;
  for (const char of prereqList) {
    if (char === "(") depth++;
    else if (char === ")") {
      depth--;
      if (depth < 0) return false;
    }
  }
  return depth === 0;
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
    /*if (!readlineSync.keyInYNStrict("Is this ok")) {
      logger.error("Cancelling scraping run.");
      exit(1);
    }*/
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
    /*if (!readlineSync.keyInYNStrict("Is this ok")) {
      logger.error("Cancelling scraping run.");
      exit(1);
    }*/
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
async function patchH32(meta: { db: ReturnType<typeof database> }) {
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
  await db.refreshMaterializedView(courseView);

  logger.info("All done!");
  exit(0);
}

main().then();
