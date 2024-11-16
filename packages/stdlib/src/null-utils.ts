/**
 * Type guard that asserts the input is defined.
 */
export const notNull = <T>(x: T): x is NonNullable<T> => x != null;

/**
 * If the input is defined, return it, otherwise return `null`.
 */
export const orNull = <T>(x: T): T | null => {
  return notNull(x) ? x : null;
};
