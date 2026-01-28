import type { DegreeWorksProgramId } from "@packages/db/schema";

/**
 * The base type for all `Rule` objects.
 */
export type RuleBase = {
  label: string;
  proxyAdvice?: {
    textList: string[];
  };
};
/**
 * A group of `numberOfRules` rules,
 * of which `numberOfGroups` must be satisfied
 * in order to fulfill this rule.
 */
export type RuleGroup = {
  ruleType: "Group";
  requirement: { numberOfGroups: string; numberOfRules: string };
  ruleArray: Rule[];
};
/**
 * An object that represents a (range of) course(s).
 */
export type Course = { discipline: string; number: string; numberEnd?: string };
/**
 * A rule that is fulfilled by taking `creditsBegin` units
 * and/or `classesBegin` courses from the `courseArray`.
 */
export type RuleCourse = {
  ruleType: "Course";
  requirement: {
    creditsBegin?: string;
    classesBegin?: string;
    courseArray: Course[];
    except?: { courseArray: Course[] };
  };
};
/**
 * A rule that has different requirements depending on some boolean condition.
 * This seems to be used to denote all specializations that can be applied to a major.
 */
export type RuleIfStmt = {
  ruleType: "IfStmt";
  requirement: { ifPart: { ruleArray: Rule[] }; elsePart?: { ruleArray: Rule[] } };
};
/**
 * A rule that refers to another block (typically a major mandating a specialization or school-wide requirements).
 */
export type RuleBlock = {
  ruleType: "Block";
  requirement: { numBlocks: string; type: string; value: string };
};
/**
 * A rule that is not a course.
 * This seems to be only used by Engineering majors
 * that have a design unit requirement.
 */
export type RuleNoncourse = {
  ruleType: "Noncourse";
  requirement: { numNoncourses: string; code: string };
};

/**
 * A rule which can be marked as complete by an advisor, e.g. the Entry Level Writing Requirement
 * or the fulfillment of GE VIII (foreign language) via high school credit
 */
export type RuleMarker = {
  // TODO: what does this look like if the student scraping hasn't completed this requirement?
  ruleType: "Complete" | "Incomplete" /* THIS IS A GUESS! */;
};

export type RuleSubset = {
  ruleType: "Subset";
  ruleArray: Rule[];
};
export type Rule = RuleBase &
  (RuleGroup | RuleCourse | RuleIfStmt | RuleBlock | RuleNoncourse | RuleMarker | RuleSubset);
export type Block = {
  requirementType: string;
  requirementValue: string;
  title: string;
  ruleArray: Rule[];
};

export interface UndergraduateRequirements {
  // university of california-wide requirements, expressed in UCI coursework
  UC: Block;
  // general education requirements
  GE: Block;
  // requirements for the four year campus honors collegium program
  CHC4: Block | undefined;
  // TODO: two-year/transfer CHC here
}

export type DWAuditOKResponse = { blockArray: Block[] };
export type DWAuditErrorResponse = { error: never };
/**
 * The type of the DegreeWorks audit response.
 */
export type DWAuditResponse = DWAuditOKResponse | DWAuditErrorResponse;

export type DWMappingResponse<T extends string> = {
  _embedded: { [P in T]: { key: string; description: string }[] };
};

// this is the data we cache on a specialization, if it is valid
export type SpecializationCache = {
  parent: DegreeWorksProgramId;
  block: Block;
};
