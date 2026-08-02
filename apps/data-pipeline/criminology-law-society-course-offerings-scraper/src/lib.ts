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

export const CRIMINOLOGY_LAW_SOCIETY_COURSE_OFFERINGS_SOURCE =
  "CRIMINOLOGY_LAW_SOCIETY_COURSE_OFFERINGS";
export const CRIMINOLOGY_LAW_SOCIETY_COURSE_OFFERINGS_URL =
  "https://students.soceco.uci.edu/pages/crmlaw-tentative-course-schedule";
const config = {
  source: CRIMINOLOGY_LAW_SOCIETY_COURSE_OFFERINGS_SOURCE,
  sourceUrl: CRIMINOLOGY_LAW_SOCIETY_COURSE_OFFERINGS_URL,
  canonicalDepartment: "CRM/LAW",
  sourceDepartmentPattern: "CRM\\s*/\\s*LAW",
  courseNumberPattern: "C\\d+[A-Z]*?",
  pageHeadingPattern: /CRM\/LAW.*Tentative Course Schedule/i,
} as const;

export const normalizeCriminologyLawSocietyCourseId = (value: string) =>
  normalizeSocialEcologyCourseId(value, config);
export const parseCriminologyLawSocietyAcademicYear = (html: string) =>
  parseSocialEcologyAcademicYear(html, config.pageHeadingPattern);
export const parseCriminologyLawSocietyDisplayedUpdate = parseSocialEcologyDisplayedUpdate;
export const parseCriminologyLawSocietyTermHeader = parseSocialEcologyTermHeader;
export const parseCriminologyLawSocietyCourseOfferings = (html: string) =>
  parseSocialEcologyCourseOfferings(html, config);
export const selectImportableCriminologyLawSocietyOfferings =
  selectImportableSocialEcologyOfferings;
export const doScrape = (
  db: ReturnType<typeof database>,
  fetcher: typeof fetch = fetch,
  now = new Date(),
) => doSocialEcologyScrape(db, config, fetcher, now);
