import type { z } from "zod";
import type { blockSchema, courseSchema } from "./schema";

/**
 * The base type for all `Rule` objects.
 */
export type RuleBase = {
  label: string;
  labelTag: string;
  ruleId: string;
  ruleType: string;
  nodeId: string;
  nodeType: string;
  ifElsePart?: "IfPart" | "ElsePart";
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

export type Course = z.infer<typeof courseSchema>;

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
 * The structure of this rule is not fully understood and is plausibly incomplete.
 */
export type RuleBlocktype = {
  ruleType: "Blocktype";
  requirement: { numBlocktypes: string; type: string };
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
 * or the fulfillment of GE VIII (foreign language) via high school credit.
 * Structly has been verified preliminarily, but hasn't been rigorously tested and may be incomplete.
 */
export type RuleMarker = {
  ruleType: "Complete" | "Incomplete";
};

export type RuleSubset = {
  ruleType: "Subset";
  ruleArray: Rule[];
};

export type Rule = RuleBase &
  (
    | RuleGroup
    | RuleCourse
    | RuleIfStmt
    | RuleBlock
    | RuleBlocktype
    | RuleNoncourse
    | RuleMarker
    | RuleSubset
  );

export type Block = z.infer<typeof blockSchema>;

export interface UndergraduateRequirements {
  // university of california-wide requirements, expressed in UCI coursework
  UC: Block;
  // general education requirements
  GE: Block;
  // requirements for the four-year campuswide honors collegium program
  CHC4: Block | undefined;
  // requirements for the two-year variant of campuswide honors collegium
  CHC2: Block | undefined;
}
