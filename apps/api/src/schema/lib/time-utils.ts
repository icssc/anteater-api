import { z } from "@hono/zod-openapi";

/**
 * Converts a start-end time string to a number of minutes since midnight.
 *
 * @example parseStartAndEndTimes("11:00-11:50a"); // { startTime: 660, endTime: 710 }
 *
 * @param time start-end time string
 * @returns startTime and endTime in minutes since midnight
 */
export const parseStartAndEndTimes = (time: string) => {
  let startTime: number;
  let endTime: number;
  const [startTimeString, endTimeString] = time
    .trim()
    .split("-")
    .map((x) => x.trim());
  const [startTimeHour, startTimeMinute] = startTimeString.split(":");
  startTime = (Number.parseInt(startTimeHour, 10) % 12) * 60 + Number.parseInt(startTimeMinute, 10);
  const [endTimeHour, endTimeMinute] = endTimeString.split(":");
  endTime = (Number.parseInt(endTimeHour, 10) % 12) * 60 + Number.parseInt(endTimeMinute, 10);
  if (endTimeMinute.includes("p")) {
    startTime += 12 * 60;
    endTime += 12 * 60;
  }
  if (startTime > endTime) startTime -= 12 * 60;
  return { startTime, endTime };
};

const TIME_REGEX = /^(\d{1,2}):(\d{2})([ap]m?)?$/i;
const MILLISECONDS_PER_MINUTE = 60 * 1000;
const MILLISECONDS_PER_HOUR = 60 * MILLISECONDS_PER_MINUTE;

/**
 * Converts a time string to a Date object.
 *
 * @example transformTime("2:00pm"); // Date('1970-01-01T14:00:00.000Z')
 *
 * @param time time string
 * @param ctx
 * @returns Date object representing the time
 */
export const transformTime = (time: string, ctx: z.RefinementCtx): Date => {
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
  .openapi({ description: "Time string in 12 or 24 hour format", example: "2:00pm" })
  .transform(transformTime);
