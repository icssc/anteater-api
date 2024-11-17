"use server";

import { createHash } from "node:crypto";
import {
  type CreateKeyFormValues,
  createKeyTransform,
  unprivilegedKeySchema,
} from "@/app/actions/types";
import { auth } from "@/auth";
import { MAX_API_KEYS } from "@/lib/utils";
import type { KeyData } from "@packages/key-types";
import { createId } from "@paralleldrive/cuid2";
import Cloudflare from "cloudflare";
import { z } from "zod";

const { CLOUDFLARE_KV_NAMESPACE_ID, CLOUDFLARE_DEFAULT_ACCOUNT_ID } = z
  .object({ CLOUDFLARE_KV_NAMESPACE_ID: z.string(), CLOUDFLARE_DEFAULT_ACCOUNT_ID: z.string() })
  .parse(process.env);

const cf = new Cloudflare();

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

  await cf.kv.namespaces.values.update(CLOUDFLARE_KV_NAMESPACE_ID, completeKey, {
    account_id: CLOUDFLARE_DEFAULT_ACCOUNT_ID,
    value: JSON.stringify(key),
    metadata: "{}",
  });

  return completeKey;
};

export const getUserKeysNames = async (id: string) => {
  const prefix = getUserPrefix(id);
  const listResult = await cf.kv.namespaces.keys.list(CLOUDFLARE_KV_NAMESPACE_ID, {
    account_id: CLOUDFLARE_DEFAULT_ACCOUNT_ID,
    prefix,
    limit: MAX_API_KEYS,
  });

  return listResult.result.map((key) => key.name);
};

export const getUserApiKeyData = async (key: string) => {
  return JSON.parse(
    await cf.kv.namespaces.values
      .get(CLOUDFLARE_KV_NAMESPACE_ID, key, { account_id: CLOUDFLARE_DEFAULT_ACCOUNT_ID })
      .then((r) => r.text()),
  );
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
  if (!session || !session.user?.id) {
    throw new Error("Unauthorized");
  }

  const keys = await getUserKeysHelper(session.user.id);
  return keys;
}

/**
 * Create the authed user's API key
 */
export async function createUserApiKey(keyData: CreateKeyFormValues) {
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
export async function editUserApiKey(key: string, keyData: CreateKeyFormValues) {
  const session = await auth();
  if (!session || !session.user?.id) {
    throw new Error("Unauthorized");
  }

  const validatedKeyData = await validateKeyInput(keyData);

  const keys = await getUserKeysNames(session.user.id);

  if (!keys.includes(key)) {
    throw new Error("API key does not exist on user");
  }

  await cf.kv.namespaces.values.update(CLOUDFLARE_KV_NAMESPACE_ID, key, {
    account_id: CLOUDFLARE_DEFAULT_ACCOUNT_ID,
    value: JSON.stringify(keyData),
    metadata: "{}",
  });

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

  await cf.kv.namespaces.values.delete(CLOUDFLARE_KV_NAMESPACE_ID, key, {
    account_id: CLOUDFLARE_DEFAULT_ACCOUNT_ID,
  });
}
