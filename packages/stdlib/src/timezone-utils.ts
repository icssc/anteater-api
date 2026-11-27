/**
 * The timezone UCI is in. Covers both PST and PDT.
 */
export const UCI_TIME_ZONE = "America/Los_Angeles";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const uciFormat = new Intl.DateTimeFormat("en-US", {
  timeZone: UCI_TIME_ZONE,
  // hour12: false can format midnight as "24", so use h23 to always get 0-23
  hourCycle: "h23",
  weekday: "short",
  year: "numeric",
  month: "numeric",
  day: "numeric",
  hour: "numeric",
  minute: "numeric",
  second: "numeric",
});

interface UciParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  weekday: number;
}

/**
 * Gets the date and time at UCI for the given instant.
 * Months are 1-12, hours are 0-23, and weekdays are 0 (Sunday) to 6 (Saturday).
 * @example getUciParts(new Date("2026-11-18T03:00:00Z")); // { year: 2026, month: 11, day: 17, ...}
 */
export function getUciParts(instant = new Date()): UciParts {
  const parts = Object.fromEntries(
    uciFormat.formatToParts(instant).map((part) => [part.type, part.value]),
  );
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    second: Number(parts.second),
    weekday: WEEKDAYS.indexOf(parts.weekday),
  };
}

/**
 * Gets the date and time at UCI as a naive `Date`, i.e. one whose UTC fields hold the UCI time.
 * Read it with `getUTC*` methods, or compare it against `timestamp without time zone` columns.
 * @example toUciNaive(new Date("2026-11-18T03:00:00Z")); // 2026-11-17T19:00:00.000Z
 */
export function toUciNaive(instant = new Date()): Date {
  const { year, month, day, hour, minute, second } = getUciParts(instant);
  return new Date(Date.UTC(year, month - 1, day, hour, minute, second));
}

/**
 * Gets the date at UCI for the given instant as YYYY-MM-DD, optionally offset by some days.
 * @example uciDateString(new Date("2026-11-18T03:00:00Z")); // "2026-11-17"
 * @example uciDateString(new Date("2026-12-31T20:00:00Z"), 1); // "2027-01-01"
 */
export function uciDateString(instant = new Date(), addDays = 0): string {
  const { year, month, day } = getUciParts(instant);
  return new Date(Date.UTC(year, month - 1, day + addDays)).toISOString().slice(0, 10);
}

/**
 * Converts a date and time at UCI to the instant it represents, accounting for daylight saving.
 * Months are 1-12 and hours are 0-23.
 * @example fromUciWallClock(2026, 11, 17, 19, 0); // 2026-11-18T03:00:00.000Z
 * @example fromUciWallClock(2026, 7, 1, 5, 0); // 2026-07-01T12:00:00.000Z
 */
export function fromUciWallClock(
  year: number,
  month: number,
  day: number,
  hour = 0,
  minute = 0,
  second = 0,
): Date {
  const naive = Date.UTC(year, month - 1, day, hour, minute, second);
  const offsetAt = (time: number) => toUciNaive(new Date(time)).getTime() - time;
  // The offset at our first guess may be on the wrong side of a DST change, so check it again
  const guess = naive - offsetAt(naive);
  return new Date(naive - offsetAt(guess));
}
