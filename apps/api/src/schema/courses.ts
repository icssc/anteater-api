import { z } from "@hono/zod-openapi";
import type { PrerequisiteTree } from "@packages/db/schema";
import { instructorPreviewSchema } from "./instructors";

const inputCourseLevels = ["LowerDiv", "UpperDiv", "Graduate"] as const;

const inputGECategories = [
  "GE-1A",
  "GE-1B",
  "GE-2",
  "GE-3",
  "GE-4",
  "GE-5A",
  "GE-5B",
  "GE-6",
  "GE-7",
  "GE-8",
] as const;

export const outputCourseLevels = [
  "Lower Division (1-99)",
  "Upper Division (100-199)",
  "Graduate/Professional Only (200+)",
] as const;

export const outputGECategories = [
  "GE Ia: Lower Division Writing",
  "GE Ib: Upper Division Writing",
  "GE II: Science and Technology",
  "GE III: Social & Behavioral Sciences",
  "GE IV: Arts and Humanities",
  "GE Va: Quantitative Literacy",
  "GE Vb: Formal Reasoning",
  "GE VI: Language Other Than English",
  "GE VII: Multicultural Studies",
  "GE VIII: International/Global Issues",
] as const;

export const coursesPathSchema = z.object({
  id: z
    .string({ message: "Parameter 'id' is required" })
    .openapi({ param: { name: "id", in: "path" } }),
});

export const batchCoursesQuerySchema = z.object({
  ids: z
    .string({ message: "Parameter 'ids' is required" })
    .transform((xs) => xs.split(","))
    .openapi({ example: "COMPSCI161,COMPSCI162" }),
});

export const coursesQuerySchema = z.object({
  department: z.string().optional(),
  courseNumber: z.string().optional(),
  courseNumeric: z.coerce.number().optional(),
  titleContains: z.string().optional(),
  courseLevel: z
    .enum(inputCourseLevels, {
      message: "If provided, 'courseLevel' must be 'LowerDiv', 'UpperDiv', or 'Graduate'",
    })
    .optional(),
  minUnits: z.coerce.number().optional(),
  maxUnits: z.coerce.number().optional(),
  descriptionContains: z.string().optional(),
  geCategory: z
    .enum(inputGECategories, {
      message:
        "If provided, 'geCategory' must be one of 'GE-1A', 'GE-1B', 'GE-2', 'GE-3', 'GE-4', 'GE-5A', 'GE-5B', 'GE-6', 'GE-7', or 'GE-8'",
    })
    .optional(),
  take: z.coerce.number().lte(100, "Page size must be less than or equal to 100").default(100),
  skip: z.coerce.number().default(0),
});

export const coursesByCursorQuerySchema = z.object({
  department: z.string().optional(),
  courseNumber: z.string().optional(),
  courseNumeric: z.coerce.number().optional(),
  titleContains: z.string().optional(),
  courseLevel: z.enum(inputCourseLevels).optional(),
  minUnits: z.coerce.number().optional(),
  maxUnits: z.coerce.number().optional(),
  descriptionContains: z.string().optional(),
  geCategory: z.enum(inputGECategories).optional(),
  cursor: z.string().optional().openapi({
    description:
      "Pagination cursor. Use the `nextCursor` value from the previous response to fetch the next page",
  }),
  take: z.coerce.number().lte(100, "Page size must be less than or equal to 100").default(100),
});

export const prerequisiteSchema = z.union([
  z.object({
    prereqType: z.literal("course"),
    coreq: z.literal(false),
    courseId: z.string(),
    minGrade: z.string().optional(),
  }),
  z.object({
    prereqType: z.literal("course"),
    coreq: z.literal(true),
    courseId: z.string(),
  }),
  z.object({
    prereqType: z.literal("exam"),
    examName: z.string(),
    minGrade: z.string().optional(),
  }),
]);

export const prerequisiteTreeSchema: z.ZodType<PrerequisiteTree> = z.object({
  AND: z
    .lazy(() => z.union([prerequisiteSchema, prerequisiteTreeSchema]).array().optional())
    .openapi({
      description:
        "All of these prerequisites must have been fulfilled before this course can be taken.",
      type: "array",
      items: {
        anyOf: [
          { $ref: "#/components/schemas/prereq" },
          { $ref: "#/components/schemas/prereqTree" },
        ],
      },
    }),
  OR: z
    .lazy(() => z.union([prerequisiteSchema, prerequisiteTreeSchema]).array().optional())
    .openapi({
      description:
        "At least one of these prerequisites must have been fulfilled before this course can be taken.",
      type: "array",
      items: {
        anyOf: [
          { $ref: "#/components/schemas/prereq" },
          { $ref: "#/components/schemas/prereqTree" },
        ],
      },
    }),
  NOT: z
    .lazy(() => z.union([prerequisiteSchema, prerequisiteTreeSchema]).array().optional())
    .openapi({
      description:
        "None of these prerequisites must have been fulfilled before this course can be taken.",
      type: "array",
      items: {
        anyOf: [
          { $ref: "#/components/schemas/prereq" },
          { $ref: "#/components/schemas/prereqTree" },
        ],
      },
    }),
});

export const coursePreviewSchema = z.object({
  id: z.string().openapi({ example: "COMPSCI161" }),
  title: z.string().openapi({ example: "Design and Analysis of Algorithms" }),
  department: z.string().openapi({ example: "COMPSCI" }),
  courseNumber: z.string().openapi({ example: "161" }),
});

export const courseSchema = z.object({
  id: z.string().openapi({ example: "COMPSCI161" }),
  department: z.string().openapi({ example: "COMPSCI" }),
  courseNumber: z.string().openapi({ example: "161" }),
  courseNumeric: z.number().int().openapi({ example: 161 }),
  school: z
    .string()
    .openapi({ example: "Donald Bren School of Information and Computer Sciences" }),
  title: z.string().openapi({ example: "Design and Analysis of Algorithms" }),
  courseLevel: z.enum(outputCourseLevels).openapi({ example: "Upper Division (100-199)" }),
  minUnits: z.number().openapi({ example: 4 }),
  maxUnits: z.number().openapi({ example: 4 }),
  description: z.string().openapi({}),
  departmentName: z.string().openapi({ example: "Computer Science" }),
  instructors: instructorPreviewSchema.array(),
  prerequisiteTree: prerequisiteTreeSchema,
  prerequisiteText: z.string(),
  prerequisites: coursePreviewSchema.array(),
  dependencies: coursePreviewSchema.array(),
  repeatability: z.string(),
  gradingOption: z.string(),
  concurrent: z.string(),
  sameAs: z.string(),
  restriction: z.string(),
  overlap: z.string(),
  corequisites: z.string(),
  geList: z.enum(outputGECategories).array(),
  geText: z.string(),
  terms: z.string().array(),
});
