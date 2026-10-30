import { z } from "@hono/zod-openapi";

import { apExamsRewardSchema } from "./ap-exams";

export const ibExamsQuerySchema = z.object({
  fullName: z.string().optional().openapi({
    description: "If provided, the full name of an IB Exam",
    example: "IB Chemistry (HL)",
  }),
  catalogueName: z.string().optional().openapi({
    description: "If provided, the catalogue name of an IB Exam",
    example: "Chemistry",
  }),
});

export const ibExamsRewardSchema = apExamsRewardSchema.extend({
  acceptableScores: z.number().int().min(5).max(7).array().openapi({
    description: "The IB exam scores eligible for this reward",
  }),
  notes: z.string().nullable().openapi({
    description: "Additional information about the credit awarded",
  }),
});

export const ibExamsResponseSchema = z.array(
  z.object({
    fullName: z.string().openapi({
      description: "The full name of this IB Exam",
      example: "IB Chemistry (HL)",
    }),
    catalogueName: z.string().nullable().openapi({
      description: "The name of this IB Exam in the UCI Catalogue, if available",
      example: "Chemistry",
    }),
    rewards: ibExamsRewardSchema.array().openapi({
      description: "Credit rewards for the eligible scores on this exam",
    }),
  }),
);
