import { z } from "@hono/zod-openapi";

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
