import { z } from "@hono/zod-openapi";
import type { APCoursesGrantedTree } from "@packages/db/schema";
import { geCategories } from "./grades.ts";

export const apExamsQuerySchema = z.object({
  fullName: z.string().optional().openapi({
    description: "If provided, the full name of an AP Exam",
    example: "AP Microeconomics",
  }),
  catalogueName: z.string().optional().openapi({
    description: "If provided, the catalogue name of an AP Exam",
    example: "AP ECONOMICS:MICRO",
  }),
});

export const coursesGrantedTree: z.ZodType<APCoursesGrantedTree> = z
  .object({
    AND: z.union([z.lazy(() => coursesGrantedTree), z.string()]).array(),
  })
  .or(
    z.object({
      OR: z.union([z.lazy(() => coursesGrantedTree), z.string()]).array(),
    }),
  );

export const apExamsRewardSchema = z.object({
  acceptableScores: z
    .number()
    .int()
    .min(1)
    .max(5)
    .array()
    .openapi({ description: "The scores on the AP Exam which are eligible for this reward" }),
  unitsGranted: z
    .number()
    .int()
    .nonnegative()
    .openapi({ description: "The number of units granted as part of this reward" }),
  electiveUnitsGranted: z.number().int().nonnegative().openapi({
    description:
      "The number of units granted as generic elective credit (but not from any course) for this reward",
  }),
  geCategories: z.enum(geCategories).array().openapi({
    description: "GE categories granted directly by this reward and not through any course",
  }),
  coursesGranted: coursesGrantedTree.openapi({
    description: "The tree describing course credit granted by this reward",
  }),
});

export const apExamsResponseSchema = z.array(
  z.object({
    fullName: z.string().openapi({
      description: "The full name of this AP Exam",
      example: "AP Microeconomics",
    }),
    catalogueName: z.string().or(z.null()).openapi({
      description:
        "The name given to this AP Exam in the UCI Catalogue, if the UCI Catalogue names this exam",
      example: "AP ECONOMICS:MICRO",
    }),
    rewards: apExamsRewardSchema
      .array()
      .openapi({ description: "The reward objects for various scores on this exam" }),
  }),
);
