export const DAY_MS = 24 * 60 * 60 * 1000;
export const WEEK_MS = 7 * DAY_MS;
export const FALL_OFFSET_MS = 4 * DAY_MS;

/**
 * Calculate the current week number within an academic quarter.
 * Fall quarters get a 4-day offset to account for Thursday instruction starts.
 */
export function getWeek(currentDate: Date, instructionStart: Date, quarter: string): number {
  const offset = quarter === "Fall" ? FALL_OFFSET_MS : 0;
  return Math.floor((currentDate.valueOf() - (instructionStart.valueOf() + offset)) / WEEK_MS) + 1;
}
