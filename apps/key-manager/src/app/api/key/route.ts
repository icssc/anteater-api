"use server";

import { createHash } from "node:crypto";
import { auth } from "@/auth";
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
  const completeKey = `${prefix}:${type}:${uniqueId}`;

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
const getUserKeyHelper = async (id: string) => {
  const ctx = await getCloudflareContext();

  const prefix = getUserPrefix(id);
  const listResult = await ctx.env.API_KEYS.list({ prefix, limit: 1 });

  if (listResult.keys.length > 0) {
    return listResult.keys[0].name;
  }
  return null;
};

/**
 * Return the authed user's API key
 */
export async function getUserApiKey() {
  const session = await auth();
  if (!session || !session.user?.id) {
    throw new Error("Unauthorized");
  }

  const key = await getUserKeyHelper(session.user.id);
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

  if ((await getUserKeyHelper(session.user.id)) != null) {
    throw new Error("User already has an API key");
  }

  const key = await createUserKeyHelper(session.user.id);

  return key;
}

/**
 * Delete the authed user's API key
 */
export async function deleteUserApiKey() {
  const session = await auth();
  if (!session || !session.user?.id) {
    throw new Error("Unauthorized");
  }

  const key = await getUserKeyHelper(session.user.id);

  if (key == null) {
    throw new Error("User does not have an API key");
  }

  const ctx = await getCloudflareContext();
  await ctx.env.API_KEYS.delete(key);
}
