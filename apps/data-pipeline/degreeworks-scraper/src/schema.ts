import type { Rule } from "$types";
import { z } from "zod";

/**
 * a specification for course range for unit req, etc.
 */
export const withClauseSchema = z.object({
  code: z.enum([
    "DWCREDITS",
    "DWCREDIT",
    "DWLOCATION",
    "DWTERM",
    "DWTITLE",
    "DWGRADETYPE",
    "DWPASSFAIL",
  ]),
  operator: z.enum(["<", "<=", "=", ">", ">=", "<>"]),
  valueList: z.array(z.string()),
});

/**
 * An object that represents a (range of) course(s).
 */
export const courseSchema = z.object({
  discipline: z.string(),
  number: z.string(),
  numberEnd: z.string().optional(),
  withArray: z.array(withClauseSchema).optional(),
});

/**
 * The base type for all `Rule` objects.
 */
export const ruleBaseSchema = z.object({
  label: z.string(),
  labelTag: z.string(),
  ruleId: z.string(),
  ruleType: z.string(),
  nodeId: z.string(),
  nodeType: z.string(),
  ifElsePart: z.enum(["IfPart", "ElsePart"]).optional(),
  proxyAdvice: z.object({ textList: z.array(z.string()) }).optional(),
});

export const ruleGroupSchema = ruleBaseSchema.extend({
  ruleType: z.literal("Group"),
  requirement: z.object({
    numberOfGroups: z.string(),
    numberOfRules: z.string(),
  }),
  ruleArray: z.lazy(() => z.array(ruleSchema)),
});

/**
 * A rule that is fulfilled by taking `creditsBegin` units
 * and/or `classesBegin` courses from the `courseArray`.
 */
export const ruleCourseSchema = ruleBaseSchema.extend({
  ruleType: z.literal("Course"),
  requirement: z.object({
    creditsBegin: z.string().optional(),
    classesBegin: z.string().optional(),
    courseArray: z.array(courseSchema),
    except: z
      .object({
        courseArray: z.array(courseSchema),
      })
      .optional(),
  }),
});

export const ruleIfStmtSchema = ruleBaseSchema.extend({
  ruleType: z.literal("IfStmt"),
  requirement: z.object({
    ifPart: z.object({
      ruleArray: z.lazy(() => z.array(ruleSchema)),
    }),
    elsePart: z
      .object({
        ruleArray: z.lazy(() => z.array(ruleSchema)),
      })
      .optional(),
  }),
});

/**
 * A rule that refers to another block (typically a major mandating a specialization or school-wide requirements).
 */
export const ruleBlockSchema = ruleBaseSchema.extend({
  ruleType: z.literal("Block"),
  requirement: z.object({
    numBlocks: z.string(),
    type: z.string(),
    value: z.string(),
  }),
});

/**
 * The structure of this rule is not fully understood and is plausibly incomplete.
 */
export const ruleBlocktypeSchema = ruleBaseSchema.extend({
  ruleType: z.literal("Blocktype"),
  requirement: z.object({
    numBlocktypes: z.string(),
    type: z.string(),
  }),
});

/**
 * A rule that is not a course.
 * This seems to be only used by Engineering majors
 * that have a design unit requirement.
 */
export const ruleNoncourseSchema = ruleBaseSchema.extend({
  ruleType: z.literal("Noncourse"),
  requirement: z.object({
    numNoncourses: z.string(),
    code: z.string(),
  }),
});

/**
 * A rule which can be marked as complete by an advisor, e.g. the Entry Level Writing Requirement
 * or the fulfillment of GE VIII (foreign language) via high school credit.
 * Structure has been verified preliminarily, but hasn't been rigorously tested and may be incomplete.
 */
export const ruleMarkerSchema = ruleBaseSchema.extend({
  ruleType: z.enum(["Complete", "Incomplete"]),
});

export const ruleSubsetSchema = ruleBaseSchema.extend({
  ruleType: z.literal("Subset"),
  ruleArray: z.array(z.lazy(() => ruleSchema)),
});

// explicit type annotation to avoid circular reference issues with zod
export const ruleSchema: z.ZodType<Rule> = z.discriminatedUnion("ruleType", [
  ruleGroupSchema,
  ruleCourseSchema,
  ruleIfStmtSchema,
  ruleBlockSchema,
  ruleBlocktypeSchema,
  ruleNoncourseSchema,
  ruleMarkerSchema,
  ruleSubsetSchema,
]);

export const blockSchema = z.object({
  requirementType: z.string(),
  requirementValue: z.string(),
  title: z.string(),
  ruleArray: z.array(ruleSchema),
});

// UndergraduateRequirements interface is not made into an equivalent Zod schema since it's made from already parsed Block objects

export const dwAuditOKResponseSchema = z.object({
  blockArray: z.array(blockSchema),
});

export const dwMappingResponseSchema = <T extends string>(key: T) =>
  z.object({
    _embedded: z.object({
      [key]: z.array(z.object({ key: z.string(), description: z.string() })),
    }),
  });

// partial schema to serve the purposes of the Scraper and avoid verbose creation of schemas representing DW types
export const degreeWorksProgramSchema = z.object({
  name: z.string(),
  school: z.enum(["U", "G"]),
  programType: z.enum(["COLLEGE", "MAJOR", "MINOR", "SPEC"]),
  code: z.string(),
  degreeType: z.string().optional(),
});

// this is stored locally and read, but can still be validated since it is being loaded from a file
// this is the data we cache on a specialization, if it is valid
export const specializationCacheSchema = z.object({
  parent: degreeWorksProgramSchema,
  block: blockSchema,
});

export const rewardTypeSchema = z.object({
  degreeCode: z.string(),
  degreeShort: z.string(),
});

export const rewardTypesResponseSchema = rewardTypeSchema.array();

export const reportSchema = z.object({
  id: z.int(),
  school: z.object({
    schoolCode: z.string(),
  }),
  major: z.object({
    majorCode: z.string(),
    // one-letter term then two-digit year, if present
    endTermYyyyst: z.string().nullable(),
    // the "active" field is true even on majors whose end term has passed and therefore must be ignored
  }),
  // we don't need the department object because degreeworks does not allow a department to be selected,
  // meaning a department could never impose requirements on a major which are not visible from the requirements of
  // the major itself
  degree: z.object({
    // teaching credentials, n-ple majors, undeclared, other misc do not have this
    // we will ignore these since they are certainly out of scope for degreeworks, but
    // it can happen at this stage
    degreeCode: z.string().nullable(),
  }),
});

export const reportsResponseSchema = reportSchema.array();
