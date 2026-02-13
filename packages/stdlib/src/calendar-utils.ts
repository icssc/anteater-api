export const DAY_MS = 24 * 60 * 60 * 1000;
export const WEEK_MS = 7 * DAY_MS;
export const FALL_OFFSET_MS = 4 * DAY_MS;

export type Period = "ADD_DROP" | "ENROLLMENT" | "REGULAR";

/**
 * Calculate the current week number within an academic quarter.
 * Fall quarters get a 4-day offset to account for Thursday instruction starts.
 */
export function getWeek(currentDate: Date, instructionStart: Date, quarter: string): number {
  const offset = quarter === "Fall" ? FALL_OFFSET_MS : 0;
  return Math.floor((currentDate.valueOf() - (instructionStart.valueOf() + offset)) / WEEK_MS) + 1;
}

/**
 * Determine the academic period based on week number.
 * Week 0-2: ADD_DROP, Week 8-10: ENROLLMENT, Other: REGULAR
 */
export function detectPeriod(week: number): Period {
  if (week >= 0 && week <= 2) return "ADD_DROP";
  if (week >= 8 && week <= 10) return "ENROLLMENT";
  return "REGULAR";
}
