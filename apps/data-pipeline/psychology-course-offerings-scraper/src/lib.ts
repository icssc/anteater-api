import type { database } from "@packages/db";
import {
  doSocialEcologyScrape,
  normalizeSocialEcologyCourseId,
  parseSocialEcologyAcademicYear,
  parseSocialEcologyCourseOfferings,
  parseSocialEcologyDisplayedUpdate,
  parseSocialEcologyTermHeader,
  selectImportableSocialEcologyOfferings,
} from "../../social-ecology-course-offerings-common/src/lib.ts";

export const PSYCHOLOGY_COURSE_OFFERINGS_SOURCE = "PSYCHOLOGY_COURSE_OFFERINGS";
export const PSYCHOLOGY_COURSE_OFFERINGS_URL =
  "https://students.soceco.uci.edu/pages/psci-tentative-course-schedule";
const config = {
  source: PSYCHOLOGY_COURSE_OFFERINGS_SOURCE,
  sourceUrl: PSYCHOLOGY_COURSE_OFFERINGS_URL,
  canonicalDepartment: "PSY",
  sourceDepartmentPattern: "PSY",
  courseNumberPattern: "\\d+[A-Z]*?",
  pageHeadingPattern: /PSY.*Tentative Course Schedule/i,
} as const;

export const normalizePsychologyCourseId = (value: string) =>
  normalizeSocialEcologyCourseId(value, config);
export const parsePsychologyAcademicYear = (html: string) =>
  parseSocialEcologyAcademicYear(html, config.pageHeadingPattern);
export const parsePsychologyDisplayedUpdate = parseSocialEcologyDisplayedUpdate;
export const parsePsychologyTermHeader = parseSocialEcologyTermHeader;
export const parsePsychologyCourseOfferings = (html: string) =>
  parseSocialEcologyCourseOfferings(html, config);
export const selectImportablePsychologyOfferings = selectImportableSocialEcologyOfferings;
export const doScrape = (
  db: ReturnType<typeof database>,
  fetcher: typeof fetch = fetch,
  now = new Date(),
) => doSocialEcologyScrape(db, config, fetcher, now);
