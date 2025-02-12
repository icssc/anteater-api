/**
 * Checks whether the provided string can be converted to a base-ten integer.
 */
export const isBaseTenInt = (s: string): boolean =>
  !Number.isNaN(Number.parseInt(s, 10)) && !Number.isNaN(Number(s));

/**
 * If the provided string can be converted to a base-ten integer,
 * returns the converted string, otherwise returns `null`.
 */
export const baseTenIntOrNull = (s: string): number | null =>
  isBaseTenInt(s) ? Number.parseInt(s, 10) : null;

/**
 * Convert a nullable `number` to `null` if negative.
 */
export const negativeAsNull = (s: number | null): number | null => ((s ?? -1) < 0 ? null : s);
