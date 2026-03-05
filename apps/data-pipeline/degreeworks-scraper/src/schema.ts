import type { Rule } from "$types";
import { z } from "zod";

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

export const courseSchema = z.object({
  discipline: z.string(),
  number: z.string(),
  numberEnd: z.string().optional(),
  withArray: z.array(withClauseSchema).optional(),
});

export const ruleBaseSchema = z.object({
  label: z.string(),
});

export const ruleGroupSchema = ruleBaseSchema.extend({
  ruleType: z.literal("Group"),
  requirement: z.object({
    numberOfGroups: z.string(),
    numberOfRules: z.string(),
  }),
  ruleArray: z.lazy(() => z.array(ruleSchema)),
});

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

export const ruleBlockSchema = ruleBaseSchema.extend({
  ruleType: z.literal("Block"),
  requirement: z.object({
    numBlocks: z.string(),
    type: z.string(),
    value: z.string(),
  }),
});

export const ruleBlocktypeSchema = ruleBaseSchema.extend({
  ruleType: z.literal("Blocktype"),
  requirement: z.object({
    numBlocktypes: z.string(),
    type: z.string(),
  }),
});

export const ruleNoncourseSchema = ruleBaseSchema.extend({
  ruleType: z.literal("Noncourse"),
  requirement: z.object({
    numNoncourses: z.string(),
    code: z.string(),
  }),
});

// seems to be verified to be either "Complete" or "Incomplete"
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

// export const dwMappingResponseSchema = z.object({})

export const degreeWorksProgramIdSchema = z.object({
  school: z.enum(["U", "G"]),
  programType: z.enum(["COLLEGE", "MAJOR", "MINOR", "SPEC"]),
  code: z.string(),
  degreeType: z.string().optional(),
});

// this is stored locally and read, but can still be validated since it is being loaded from a file
export const specializationCacheSchema = z.object({
  parent: degreeWorksProgramIdSchema,
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
