import { notNull } from "./null-utils";

/**
 * Gets the value corresponding to the `key` from the `map` provided,
 * throwing an error if the value is not defined.
 */
export function getFromMapOrThrow<K, V>(map: Map<K, V>, key: K): V {
  const val = map.get(key);
  if (notNull(val)) return val;
  throw new Error(`KeyError: ${key}`);
}
