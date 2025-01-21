import { z } from "@hono/zod-openapi";

const allDays = [
  "M",
  "Mo",
  "Mon",
  "Tu",
  "Tue",
  "Tues",
  "W",
  "We",
  "Wed",
  "Th",
  "Thu",
  "Thur",
  "F",
  "Fr",
  "Fri",
  "S",
  "Sa",
  "Sat",
  "Su",
  "Sun",
] as const;

const normalizedDays = ["M", "Tu", "W", "Th", "F", "S", "Su"] as const;

const dayMapping: Record<(typeof allDays)[number], (typeof normalizedDays)[number]> = {
  M: "M",
  Mo: "M",
  Mon: "M",
  Tu: "Tu",
  Tue: "Tu",
  Tues: "Tu",
  W: "W",
  We: "W",
  Wed: "W",
  Th: "Th",
  Thu: "Th",
  Thur: "Th",
  F: "F",
  Fr: "F",
  Fri: "F",
  S: "S",
  Sa: "S",
  Sat: "S",
  Su: "Su",
  Sun: "Su",
};

const isValidDay = (day: string): day is (typeof allDays)[number] =>
  !!(dayMapping as Record<string, unknown>)[day];

/**
 * Transform a string of days into an array of normalized days
 *
 * @example
 * daysTransform("Mon,W,Thur,Fr");
 * // ["M", "W", "Th", "F"]
 *
 * @param days string of days (e.g. "M,W,F")
 * @param ctx z.RefineCtx
 *
 * @returns array of normalized days
 */
const daysTransform = (days: string | undefined, ctx: z.RefinementCtx) => {
  if (!days) return undefined;
  const parsedDays: Array<(typeof normalizedDays)[number]> = [];
  for (const day of days.split(",").map((day) => day.trim())) {
    if (!isValidDay(day)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `'${day}' is not a valid day of the week. Valid days of the week are ${allDays.join(", ")}.`,
      });
      return z.NEVER;
    }
    parsedDays.push(dayMapping[day]);
  }
  return parsedDays;
};

export const daysSchema = z.string().transform(daysTransform).openapi({
  description: "The days of the week for when the course meets",
  example: "M,Tu,W,Th,F",
});
