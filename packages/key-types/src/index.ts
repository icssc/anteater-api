/**
 * The set of additional resources where access must be granted on a per-key basis.
 */
export const accessControlledResources = [
  "FUZZY_SEARCH", // Access to the fuzzy search route.
] as const;

export type AccessControlledResource = (typeof accessControlledResources)[number];

/**
 * Data that is specific to a publishable key.
 *
 * A publishable key is intended for frontend use, so we ensure that the origin of the request bearing this key matches
 * one of the origins on file, and that the origin is enabled. If it doesn't, we reject the request.
 */
type PublishableKeyData = {
  _type: "publishable";
  origins: Record<string, boolean>;
};

/**
 * Data that is specific to a secret key.
 *
 * A secret key is intended for backend use, so we don't do any additional verification.
 */
type SecretKeyData = {
  _type: "secret";
};

/**
 * Data that is common to all types of keys.
 */
export type BaseKeyData = {
  /**
   * User assigned name for the key.
   */
  name: string;

  /**
   * Date the key was created.
   */
  createdAt: Date;

  /**
   * If present, requests made using this key will be subject to a rate limit of this many requests per hour,
   * instead of the default limit.
   */
  rateLimitOverride?: number;

  /**
   * If present, specifies which additional resources requests made using this key are allowed to access.
   */
  resources?: Record<AccessControlledResource, boolean>;
};

export type KeyData = BaseKeyData & (PublishableKeyData | SecretKeyData);
