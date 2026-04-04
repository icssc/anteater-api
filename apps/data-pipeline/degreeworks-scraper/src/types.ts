import type { z } from "zod";
import type {
  blockSchema,
  ruleBaseSchema,
  ruleBlockSchema,
  ruleBlocktypeSchema,
  ruleCourseSchema,
  ruleMarkerSchema,
  ruleNoncourseSchema,
  specializationCacheSchema,
  withClauseSchema,
} from "./schema";

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
 * A rule that has different requirements depending on some boolean condition.
 * This seems to be used to denote all specializations that can be applied to a major.
 */
export type RuleIfStmt = {
  ruleType: "IfStmt";
  requirement: { ifPart: { ruleArray: Rule[] }; elsePart?: { ruleArray: Rule[] } };
};

export type RuleSubset = {
  ruleType: "Subset";
  ruleArray: Rule[];
};

export type Rule = z.infer<typeof ruleBaseSchema> &
  (
    | RuleGroup
    | z.infer<typeof ruleCourseSchema>
    | RuleIfStmt
    | z.infer<typeof ruleBlockSchema>
    | z.infer<typeof ruleBlocktypeSchema>
    | z.infer<typeof ruleNoncourseSchema>
    | z.infer<typeof ruleMarkerSchema>
    | RuleSubset
  );

export type Block = z.infer<typeof blockSchema>;

export type WithClause = z.infer<typeof withClauseSchema>;

export type SpecializationCache = z.infer<typeof specializationCacheSchema>;

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
