import { z } from "@hono/zod-openapi";
import type { ExamCoursesGrantedTree } from "@packages/stdlib";
import { geCategories } from "./lib";

type ExamType = "AP" | "IB";

// Keep the existing recursion implementation for OpenAPI compatibility
export const coursesGrantedTreeSchema: z.ZodType<ExamCoursesGrantedTree> = z
  .object({
    AND: z
      .union([z.lazy(() => coursesGrantedTreeSchema), z.string()])
      .array()
      .openapi({
        description: "All of these entries are granted",
        type: "array",
      }),
  })
  .or(
    z.object({
      OR: z
        .union([z.lazy(() => coursesGrantedTreeSchema), z.string()])
        .array()
        .openapi({
          description: "Any one of these entries is granted",
          type: "array",
          items: { $ref: "#/components/schemas/coursesGrantedTree" },
        }),
    }),
  );

function createExamQuerySchema(
  examType: ExamType,
  fullNameExample: string,
  catalogueNameExample: string,
) {
  return z.object({
    fullName: z
      .string()
      .optional()
      .openapi({
        description: `If provided, the full name of an ${examType} Exam`,
        example: fullNameExample,
      }),
    catalogueName: z
      .string()
      .optional()
      .openapi({
        description: `If provided, the catalogue name of an ${examType} Exam`,
        example: catalogueNameExample,
      }),
  });
}

export const apExamsQuerySchema = createExamQuerySchema(
  "AP",
  "AP Microeconomics",
  "AP ECONOMICS:MICRO",
);

export const ibExamsQuerySchema = createExamQuerySchema("IB", "IB Chemistry (HL)", "Chemistry");

function createExamRewardSchema(examType: ExamType, minScore: number, maxScore: number) {
  return z.object({
    acceptableScores: z
      .number()
      .int()
      .min(minScore)
      .max(maxScore)
      .array()
      .openapi({
        description: `The scores on the ${examType} Exam which are eligible for this reward`,
      }),

    unitsGranted: z.number().int().nonnegative().openapi({
      description: "The number of units granted as part of this reward",
    }),

    electiveUnitsGranted: z.number().int().nonnegative().openapi({
      description:
        "The number of units granted as generic elective credit (but not from any course) for this reward",
    }),

    geGranted: z.partialRecord(z.enum(geCategories), z.number().int().nonnegative()).openapi({
      description:
        "Courses in GE categories granted directly by this reward and not through any course",
    }),

    coursesGranted: coursesGrantedTreeSchema.openapi({
      description: "The tree describing course credit granted by this reward",
    }),

    notes: z.string().nullable().openapi({
      description: "Additional information about the credit awarded",
    }),
  });
}

export const apExamsRewardSchema = createExamRewardSchema("AP", 1, 5);
export const ibExamsRewardSchema = createExamRewardSchema("IB", 5, 7);

function createExamResponseSchema(
  examType: ExamType,
  fullNameExample: string,
  catalogueNameExample: string,
  rewardSchema: ReturnType<typeof createExamRewardSchema>,
) {
  return z.array(
    z.object({
      fullName: z.string().openapi({
        description: `The full name of this ${examType} Exam`,
        example: fullNameExample,
      }),

      catalogueName: z
        .string()
        .nullable()
        .openapi({
          description: `The name given to this ${examType} Exam in the UCI Catalogue, if available`,
          example: catalogueNameExample,
        }),

      rewards: rewardSchema.array().openapi({
        description: "The reward objects for various scores on this exam",
      }),
    }),
  );
}

export const apExamsResponseSchema = createExamResponseSchema(
  "AP",
  "AP Microeconomics",
  "AP ECONOMICS:MICRO",
  apExamsRewardSchema,
);

export const ibExamsResponseSchema = createExamResponseSchema(
  "IB",
  "IB Chemistry (HL)",
  "Chemistry",
  ibExamsRewardSchema,
);
