"use server";

import { hash } from "node:crypto";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import type { KeyData } from "@packages/key-types";
import { createId } from "@paralleldrive/cuid2";
import type { Session } from "next-auth";
import { type CreateKeyFormValues, keyFormSchema, keyStorageCodec } from "@/app/actions/types";
import { auth } from "@/auth";
import { MAX_API_KEYS } from "@/lib/utils";

function getUserPrefix(userId: string) {
  return hash("sha256", userId, { outputEncoding: "base64url" });
}

export async function makeKeyForStorage(
  session: Session | null,
  key: string | undefined,
  input: CreateKeyFormValues,
): Promise<KeyData> {
  const keyInPlace = key ? await getKeyById(key) : undefined;
  const asStorage = keyStorageCodec.decode(keyFormSchema.parse(input));

  if (keyInPlace) {
    // if we are editing, do not allow update to createdAt
    asStorage.createdAt = keyInPlace.createdAt;
  }

  if (!session?.user.isAdmin) {
    // non-admin users may not modify these fields
    asStorage.rateLimitOverride = keyInPlace?.rateLimitOverride;
    asStorage.resources = keyInPlace?.resources;
  }

  return asStorage;
}

async function createKeyInner(userId: string, key: KeyData) {
  const prefix = getUserPrefix(userId);
  const uniqueId = createId();
  const type = key._type === "publishable" ? "pk" : "sk";
  const keyId = `${prefix}.${type}.${uniqueId}`;

  await getCloudflareContext().env.API_KEYS.put(keyId, JSON.stringify(key));

  return keyId;
}

export async function getKeyNamesOwnedBy(id: string) {
  const prefix = getUserPrefix(id);
  const listResult = await getCloudflareContext().env.API_KEYS.list({
    prefix,
    limit: MAX_API_KEYS,
  });

  return listResult.keys.map((key) => key.name);
}

export async function getKeyById(key: string) {
  const text = await getCloudflareContext().env.API_KEYS.get(key);
  return text ? (JSON.parse(text) as KeyData) : undefined;
}

export async function getKeysOwned() {
  const session = await auth();
  if (!session?.user?.id) {
    throw new Error("Unauthorized");
  }

  const keys = await getKeyNamesOwnedBy(session.user.id);

  const keysDataEntries = await Promise.all(
    keys.map(async (key) => {
      const data = await getKeyById(key);
      return data ? [key, data] : null;
    }),
  );

  return Object.fromEntries(keysDataEntries.filter((entry) => entry !== null));
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

export async function createKey(keyData: CreateKeyFormValues): Promise<CreateUserApiKeyResult> {
  const session = await auth();

  const validatedKeyData = await makeKeyForStorage(session, undefined, keyData);

  if (!session?.user?.id || !session.user?.email) {
    return { ok: false, error: "Unauthorized" };
  }

  if (session.user.email.split("@")[1] !== "uci.edu" && !session.user.isAdmin) {
    return { ok: false, error: "User must have an @uci.edu email address" };
  }

  const userKeys = await getKeyNamesOwnedBy(session.user.id);

  if (userKeys.length >= MAX_API_KEYS) {
    return { ok: false, error: "User at max API key limit" };
  }

  const key = await createKeyInner(session.user.id, validatedKeyData);
  return { ok: true, key, keyData: validatedKeyData };
}

export async function editKey(key: string, keyData: CreateKeyFormValues) {
  const session = await auth();
  if (!session?.user?.id) {
    throw new Error("Unauthorized");
  }

  if ((await getCloudflareContext().env.API_KEYS.get(key)) === null) {
    throw new Error("key does not exist on user");
  }

  const validatedKeyData = await makeKeyForStorage(session, key, keyData);
  await getCloudflareContext().env.API_KEYS.put(key, JSON.stringify(keyData));

  return validatedKeyData;
}

export async function deleteKeyById(key: string) {
  const session = await auth();
  if (!session?.user?.id) {
    throw new Error("Unauthorized");
  }

  const keys = await getKeyNamesOwnedBy(session.user.id);

  if (!keys.includes(key)) {
    throw new Error("API key does not exist on user");
  }

  await getCloudflareContext().env.API_KEYS.delete(key);
}
