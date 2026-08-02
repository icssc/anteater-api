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

export const URBAN_PLANNING_PUBLIC_POLICY_COURSE_OFFERINGS_SOURCE =
  "URBAN_PLANNING_PUBLIC_POLICY_COURSE_OFFERINGS";
export const URBAN_PLANNING_PUBLIC_POLICY_COURSE_OFFERINGS_URL =
  "https://students.soceco.uci.edu/pages/uppp-tentative-course-schedule";
const config = {
  source: URBAN_PLANNING_PUBLIC_POLICY_COURSE_OFFERINGS_SOURCE,
  sourceUrl: URBAN_PLANNING_PUBLIC_POLICY_COURSE_OFFERINGS_URL,
  canonicalDepartment: "UPPP",
  sourceDepartmentPattern: "UPPP",
  courseNumberPattern: "\\d+[A-Z]*?",
  pageHeadingPattern: /UPPP.*Tentative Course Schedule/i,
} as const;

export const normalizeUrbanPlanningPublicPolicyCourseId = (value: string) =>
  normalizeSocialEcologyCourseId(value, config);
export const parseUrbanPlanningPublicPolicyAcademicYear = (html: string) =>
  parseSocialEcologyAcademicYear(html, config.pageHeadingPattern);
export const parseUrbanPlanningPublicPolicyDisplayedUpdate = parseSocialEcologyDisplayedUpdate;
export const parseUrbanPlanningPublicPolicyTermHeader = parseSocialEcologyTermHeader;
export const parseUrbanPlanningPublicPolicyCourseOfferings = (html: string) =>
  parseSocialEcologyCourseOfferings(html, config);
export const selectImportableUrbanPlanningPublicPolicyOfferings =
  selectImportableSocialEcologyOfferings;
export const doScrape = (
  db: ReturnType<typeof database>,
  fetcher: typeof fetch = fetch,
  now = new Date(),
) => doSocialEcologyScrape(db, config, fetcher, now);
