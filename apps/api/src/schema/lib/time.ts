import { z } from "@hono/zod-openapi";

const TIME_REGEX_PART = "(\\d{1,2}):(\\d{2})([ap]m?)?";
export const TIME_REGEX = new RegExp(`^${TIME_REGEX_PART}$`, "i");
export const TIME_RANGE_REGEX = new RegExp(`^${TIME_REGEX_PART}-${TIME_REGEX_PART}$`, "i");
const MILLISECONDS_PER_MINUTE = 60 * 1000;
const MILLISECONDS_PER_HOUR = 60 * MILLISECONDS_PER_MINUTE;

/**
 * Converts a time string to a Date object.
 *
 * @example
 * transformTime("2:00pm");
 * // Date('1970-01-01T14:00:00.000Z')
 *
 * @param time time string
 * @param ctx
 * @returns Date object representing the time
 */
const transformTime = (time: string, ctx: z.RefinementCtx): Date => {
  const match = time.match(TIME_REGEX);

  if (!match) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: `Invalid time format: ${time}`,
    });
    return z.NEVER;
  }

  const [, hourString, minuteString, period] = match;

  let hour = Number.parseInt(hourString, 10);
  const minute = Number.parseInt(minuteString, 10);

  if (period?.startsWith("p") && hour !== 12) {
    hour += 12;
  } else if (period?.startsWith("a") && hour === 12) {
    hour = 0;
  }

  if (minute >= 60 || hour >= 24) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: `Invalid time: ${time}`,
    });
    return z.NEVER;
  }

  return new Date(hour * MILLISECONDS_PER_HOUR + minute * MILLISECONDS_PER_MINUTE);
};

export const timeSchema = z
  .string()
  .regex(TIME_REGEX)
  .openapi({ description: "Time string in 12 or 24 hour format", examples: ["7:30pm", "19:30"] })
  .transform(transformTime);

export const timeRangeSchema = z
  .string()
  .regex(TIME_RANGE_REGEX)
  .transform((s) => s.split("-"))
  .pipe(timeSchema.array().length(2))
  .openapi({
    description: "Time range; endpoints may be in 12 or 24 hour format",
    example: "8:00am-14:00",
  });
