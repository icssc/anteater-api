"use server";

import { createHash } from "node:crypto";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import type { KeyData } from "@packages/key-types";
import { createId } from "@paralleldrive/cuid2";
import {
  type CreateKeyFormValues,
  createKeyTransform,
  unprivilegedKeySchema,
} from "@/app/actions/types";
import { auth } from "@/auth";
import { MAX_API_KEYS } from "@/lib/utils";

const getUserPrefix = (userId: string) => createHash("sha256").update(userId).digest("base64url");

export const validateKeyInput = async (input: CreateKeyFormValues): Promise<KeyData> => {
  const session = await auth();

  if (!session?.user?.isAdmin) {
    unprivilegedKeySchema.parse(input);
  }

  return createKeyTransform.parse(input);
};

const createUserKeyHelper = async (userId: string, key: KeyData) => {
  const prefix = getUserPrefix(userId);
  const uniqueId = createId();
  const type = key._type === "publishable" ? "pk" : "sk";
  const completeKey = `${prefix}.${type}.${uniqueId}`;

  await getCloudflareContext().env.API_KEYS.put(completeKey, JSON.stringify(key), {
    metadata: "{}",
  });

  return completeKey;
};

export const getUserKeysNames = async (id: string) => {
  const prefix = getUserPrefix(id);
  const listResult = await getCloudflareContext().env.API_KEYS.list({
    prefix,
    limit: MAX_API_KEYS,
  });

  return listResult.keys.map((key) => key.name);
};

export const getUserApiKeyData = async (key: string) => {
  const text = await getCloudflareContext().env.API_KEYS.get(key);
  return text ? JSON.parse(text) : undefined;
};

/**
 * Returns the user's API key
 *
 * @param id user's id
 * @return the user's api key if it exists, otherwise null
 */
const getUserKeysHelper = async (id: string): Promise<Record<string, KeyData>> => {
  const keys = await getUserKeysNames(id);

  const keysDataEntries = await Promise.all(
    keys.map(async (key) => {
      const data = await getUserApiKeyData(key);
      return data ? [key, data] : null;
    }),
  );

  return Object.fromEntries(keysDataEntries.filter((entry) => entry !== null));
};

/**
 * Return the authed user's API key
 */
export async function getUserApiKeys() {
  const session = await auth();
  if (!session?.user?.id) {
    throw new Error("Unauthorized");
  }

  const keys = await getUserKeysHelper(session.user.id);
  return keys;
}

export type CreateUserApiKeyResult =
  | {
      ok: false;
      error: string;
    }
  | {
      ok: true;
      key: string;
      keyData: KeyData;
    };

/**
 * Create the authed user's API key
 */
export async function createUserApiKey(
  keyData: CreateKeyFormValues,
): Promise<CreateUserApiKeyResult> {
  const validatedKeyData = await validateKeyInput(keyData);

  const session = await auth();
  if (!session?.user?.id || !session.user?.email) {
    return { ok: false, error: "Unauthorized" };
  }

  if (session.user.email.split("@")[1] !== "uci.edu") {
    return { ok: false, error: "User must have an @uci.edu email address" };
  }

  const userKeys = await getUserKeysNames(session.user.id);

  if (userKeys.length >= MAX_API_KEYS) {
    return { ok: false, error: "User at max API key limit" };
  }

  const key = await createUserKeyHelper(session.user.id, validatedKeyData);

  return { ok: true, key, keyData: validatedKeyData };
}

/**
 * Edit the authed user's API key
 */
export async function editUserApiKey(key: string, keyData: CreateKeyFormValues) {
  const session = await auth();
  if (!session?.user?.id) {
    throw new Error("Unauthorized");
  }

  const validatedKeyData = await validateKeyInput(keyData);

  const keys = await getUserKeysNames(session.user.id);

  if (!keys.includes(key)) {
    throw new Error("API key does not exist on user");
  }

  await getCloudflareContext().env.API_KEYS.put(key, JSON.stringify(keyData), {
    metadata: "{}",
  });

  return validatedKeyData;
}

/**
 * Delete the authed user's API key
 */
export async function deleteUserApiKey(key: string) {
  const session = await auth();
  if (!session?.user?.id) {
    throw new Error("Unauthorized");
  }

  const keys = await getUserKeysNames(session.user.id);

  if (!keys.includes(key)) {
    throw new Error("API key does not exist on user");
  }

  await getCloudflareContext().env.API_KEYS.delete(key);
}
