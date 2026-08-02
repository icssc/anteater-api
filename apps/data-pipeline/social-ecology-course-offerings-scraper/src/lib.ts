import type { database } from "@packages/db";
import {
  normalizeSocialEcologyCourseId as commonNormalizeSocialEcologyCourseId,
  parseSocialEcologyAcademicYear as commonParseSocialEcologyAcademicYear,
  parseSocialEcologyCourseOfferings as commonParseSocialEcologyCourseOfferings,
  parseSocialEcologyDisplayedUpdate as commonParseSocialEcologyDisplayedUpdate,
  parseSocialEcologyTermHeader as commonParseSocialEcologyTermHeader,
  selectImportableSocialEcologyOfferings as commonSelectImportableSocialEcologyOfferings,
  doSocialEcologyScrape,
} from "../../social-ecology-course-offerings-common/src/lib.ts";

export const SOCIAL_ECOLOGY_COURSE_OFFERINGS_SOURCE = "SOCIAL_ECOLOGY_COURSE_OFFERINGS";
export const SOCIAL_ECOLOGY_COURSE_OFFERINGS_URL =
  "https://students.soceco.uci.edu/pages/socecol-tentative-course-schedule";
const config = {
  source: SOCIAL_ECOLOGY_COURSE_OFFERINGS_SOURCE,
  sourceUrl: SOCIAL_ECOLOGY_COURSE_OFFERINGS_URL,
  canonicalDepartment: "SOCECOL",
  sourceDepartmentPattern: "SOC\\s*ECOL",
  courseNumberPattern: "H?\\d+[A-Z]*?",
  pageHeadingPattern: /SocEcol.*Tentative Course Schedule/i,
} as const;

export const normalizeSocialEcologyCourseId = (value: string) =>
  commonNormalizeSocialEcologyCourseId(value, config);
export const parseSocialEcologyAcademicYear = (html: string) =>
  commonParseSocialEcologyAcademicYear(html, config.pageHeadingPattern);
export const parseSocialEcologyDisplayedUpdate = commonParseSocialEcologyDisplayedUpdate;
export const parseSocialEcologyTermHeader = commonParseSocialEcologyTermHeader;
export const parseSocialEcologyCourseOfferings = (html: string) =>
  commonParseSocialEcologyCourseOfferings(html, config);
export const selectImportableSocialEcologyOfferings = commonSelectImportableSocialEcologyOfferings;
export const doScrape = (
  db: ReturnType<typeof database>,
  fetcher: typeof fetch = fetch,
  now = new Date(),
) => doSocialEcologyScrape(db, config, fetcher, now);
