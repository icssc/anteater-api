import { z } from "@hono/zod-openapi";

export const apExamsQuerySchema = z.object({
  id: z.string().optional().openapi({
    description: "If provided, the name of an AP Exam as it appears in the UCI Catalogue",
    example: "AP ECONOMICS:MICRO",
  }),
});

export const apExamsResponseSchema = z.array(
  z.object({
    catalogueName: z.string().openapi({
      description: "The name given to this AP Exam in the UCI Catalogue",
      example: "AP ECONOMICS:MICRO",
    }),
    officialName: z.string().openapi({
      description: "The official, full name of this AP Exam",
      example: "AP Microeconomics",
    }),
  }),
);
