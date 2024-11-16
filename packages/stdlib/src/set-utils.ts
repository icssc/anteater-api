/**
 * Returns the intersection of all sets provided.
 */
export const intersectAll = <T>(thisSet: Set<T>, ...thoseSets: Set<T>[]): Set<T> =>
  thoseSets.length === 0
    ? thisSet
    : intersectAll(
        new Set(Array.from(thisSet).filter((x) => thoseSets[0].has(x))),
        ...thoseSets.slice(1),
      );
