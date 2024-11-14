"use server";

import { createHash } from "node:crypto";
import type { KeyData } from "@/../../api/src/types/keys";
import {
  baseKeySchema,
  privilegedBaseKeySchema,
  publishableKeySchema,
  secretKeySchema,
} from "@/app/actions/types";
import { auth } from "@/auth";
import { MAX_API_KEYS } from "@/lib/utils";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { createId } from "@paralleldrive/cuid2";

const getUserPrefix = (userId: string) => {
  const hash = createHash("sha256");
  const prefix = hash.update(userId).digest("base64url");

  return prefix;
};

export const validateKeyInput = async (input: Partial<KeyData>): Promise<KeyData> => {
  const session = await auth();

  if (session?.user?.isAdmin) {
    privilegedBaseKeySchema.parse(input);
  } else {
    baseKeySchema.parse(input);
  }

  let validatedKey: KeyData;

  if (input._type === "publishable") {
    validatedKey = publishableKeySchema.parse({
      ...input,
      origins: input.origins,
    });
  } else if (input._type === "secret") {
    validatedKey = secretKeySchema.parse({
      ...input,
    });
  } else {
    throw new Error("Invalid key type");
  }

  return validatedKey;
};

const createUserKeyHelper = async (userId: string, key: KeyData) => {
  const prefix = getUserPrefix(userId);
  const uniqueId = createId();
  const type = key._type === "publishable" ? "pk" : "sk";
  const completeKey = `${prefix}.${type}.${uniqueId}`;

  const ctx = await getCloudflareContext();
  await ctx.env.API_KEYS.put(completeKey, JSON.stringify(key));

  return completeKey;
};

const getUserKeysNames = async (id: string) => {
  const ctx = await getCloudflareContext();

  const prefix = getUserPrefix(id);
  const listResult = await ctx.env.API_KEYS.list({
    prefix,
    limit: MAX_API_KEYS,
  });

  return listResult.keys.map((key) => key.name);
};

/**
 * Returns the user's API key
 *
 * @param id user's id
 * @return the user's api key if it exists, otherwise null
 */
const getUserKeysHelper = async (id: string): Promise<Record<string, KeyData>> => {
  const ctx = await getCloudflareContext();

  const keys = await getUserKeysNames(id);

  const keysDataEntries = await Promise.all(
    keys.map(async (key) => {
      const data = await ctx.env.API_KEYS.get<KeyData>(key, { type: "json" });
      return data ? [key, data] : null; // return key-data pair or null
    }),
  );

  return Object.fromEntries(keysDataEntries.filter((entry) => entry !== null));
};

/**
 * Return the authed user's API key
 */
export async function getUserApiKeys() {
  const session = await auth();
  if (!session || !session.user?.id) {
    throw new Error("Unauthorized");
  }

  const key = await getUserKeysHelper(session.user.id);
  return key;
}

/**
 * Create the authed user's API key
 */
export async function createUserApiKey(keyData: Partial<KeyData>) {
  const validatedKeyData = await validateKeyInput(keyData);

  const session = await auth();
  if (!session || !session.user?.id || !session.user?.email) {
    throw new Error("Unauthorized");
  }

  if (session.user.email.split("@")[1] !== "uci.edu") {
    throw new Error("User must have an @uci.edu email address");
  }

  const userKeys = await getUserKeysNames(session.user.id);

  if (userKeys.length >= MAX_API_KEYS) {
    throw new Error("User at max API key limit");
  }

  const key = await createUserKeyHelper(session.user.id, validatedKeyData);

  return { key, keyData: validatedKeyData };
}

/**
 * Edit the authed user's API key
 */
export async function editUserApiKey(key: string, keyData: Partial<KeyData>) {
  const validatedKeyData = await validateKeyInput(keyData);

  const session = await auth();
  if (!session || !session.user?.id) {
    throw new Error("Unauthorized");
  }

  const keys = await getUserKeysNames(session.user.id);

  if (!keys.includes(key)) {
    throw new Error("API key does not exist on user");
  }

  const ctx = await getCloudflareContext();
  await ctx.env.API_KEYS.put(key, JSON.stringify(validatedKeyData));

  return validatedKeyData;
}

/**
 * Delete the authed user's API key
 */
export async function deleteUserApiKey(key: string) {
  const session = await auth();
  if (!session || !session.user?.id) {
    throw new Error("Unauthorized");
  }

  const keys = await getUserKeysNames(session.user.id);

  if (!keys.includes(key)) {
    throw new Error("API key does not exist on user");
  }

  const ctx = await getCloudflareContext();
  await ctx.env.API_KEYS.delete(key);
}
