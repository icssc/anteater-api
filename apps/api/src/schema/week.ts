import { z } from "@hono/zod-openapi";
import { yearSchema } from "./lib";
const shortMonths = [4, 6, 9, 11];

const isLeap = (x: number) => x % 4 === 0 && (x % 100 === 0 ? x % 400 === 0 : true);

export const weekQuerySchema = z
  .object({
    year: yearSchema
      .transform((x) => Number.parseInt(x, 10))
      .openapi({ example: "2024" })
      .optional(),
    month: z.coerce
      .number()
      .refine((x) => 1 <= x && x <= 12, {
        message: "Parameter 'month' must be an integer between 1 and 12",
      })
      .openapi({ example: 9 })
      .optional(),
    day: z.coerce
      .number()
      .refine((x) => 1 <= x && x <= 31, {
        message: "Parameter 'day' must be an integer between 1 and 31",
      })
      .openapi({ example: 30 })
      .optional(),
  })
  .refine(({ year, month, day }) => (year && month && day) || (!year && !month && !day), {
    message: "If one parameter is provided, all parameters must be provided.",
  })
  .refine(
    ({ year, month, day }) =>
      year && month && day
        ? (month === 2 ? (isLeap(year) ? day < 30 : day < 29) : true) &&
          (shortMonths.includes(month) ? day < 31 : true)
        : true,
    { message: "The day provided is not valid for the month provided" },
  )
  .openapi({
    description: "The date for which to fetch data. If not provided, will fetch data for today.",
  });

export const weekSchema = z.object({
  weeks: z
    .tuple([z.number().int()])
    .or(z.tuple([z.number().int(), z.number().int()]))
    .openapi({
      description:
        "What week it is for each quarter that is in session, corresponding to the 'quarters' array.",
      example: [1],
    }),
  quarters: z
    .tuple([z.string()])
    .or(z.tuple([z.string(), z.string()]))
    .openapi({
      description: "The quarter(s) that is/are currently in session.",
      example: ["Fall Quarter 2024"],
    }),
  display: z.string().openapi({ example: "Week 1 • Fall Quarter 2024" }),
});
