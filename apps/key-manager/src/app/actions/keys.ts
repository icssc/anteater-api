"use server";

import { createHash } from "node:crypto";
import { auth } from "@/auth";
import { MAX_API_KEYS } from "@/lib/utils";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { createId } from "@paralleldrive/cuid2";

const getUserPrefix = (userId: string) => {
  const hash = createHash("sha256");
  const prefix = hash.update(userId).digest("base64url");

  return prefix;
};

const createUserKeyHelper = async (userId: string) => {
  const prefix = getUserPrefix(userId);
  const type = "sk";
  const uniqueId = createId();
  const completeKey = `${prefix}.${type}.${uniqueId}`;

  const ctx = await getCloudflareContext();
  await ctx.env.API_KEYS.put(completeKey, '{"_type":"secret","resources":{"FUZZY_SEARCH":true}}');

  return completeKey;
};

/**
 * Returns the user's API key
 *
 * @param id user's id
 * @return the user's api key if it exists, otherwise null
 */
const getUserKeysHelper = async (id: string) => {
  const ctx = await getCloudflareContext();

  const prefix = getUserPrefix(id);
  const listResult = await ctx.env.API_KEYS.list({ prefix, limit: MAX_API_KEYS });

  return listResult.keys.map((key) => key.name);
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
export async function createUserApiKey() {
  const session = await auth();
  if (!session || !session.user?.id || !session.user?.email) {
    throw new Error("Unauthorized");
  }

  if (session.user.email.split("@")[1] !== "uci.edu") {
    throw new Error("User must have an @uci.edu email address");
  }

  if ((await getUserKeysHelper(session.user.id)).length >= MAX_API_KEYS) {
    throw new Error("User at max API key limit");
  }

  const key = await createUserKeyHelper(session.user.id);

  return key;
}

/**
 * Delete the authed user's API key
 */
export async function deleteUserApiKey(key: string) {
  const session = await auth();
  if (!session || !session.user?.id) {
    throw new Error("Unauthorized");
  }

  const keys = await getUserKeysHelper(session.user.id);

  if (!keys.includes(key)) {
    throw new Error("API key does not exist on user");
  }

  const ctx = await getCloudflareContext();
  await ctx.env.API_KEYS.delete(key);
}
