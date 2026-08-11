"use server";

import { createHash } from "node:crypto";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import type { KeyData } from "@packages/key-types";
import { createId } from "@paralleldrive/cuid2";
import { type CreateKeyFormValues, keyFormSchema, keyStorageCodec } from "@/app/actions/types";
import { auth } from "@/auth";
import { MAX_API_KEYS } from "@/lib/utils";

const getUserPrefix = (userId: string) => createHash("sha256").update(userId).digest("base64url");

export const validateKeyInput = async (input: CreateKeyFormValues): Promise<KeyData> => {
  const session = await auth();

  const parsed = keyFormSchema.parse(input);

  if (!session?.user?.isAdmin) {
    parsed.resources = parsed.rateLimitOverride = undefined;
  }

  return keyStorageCodec.decode(parsed);
};

const createKeyInner = async (userId: string, key: KeyData) => {
  const prefix = getUserPrefix(userId);
  const uniqueId = createId();
  const type = key._type === "publishable" ? "pk" : "sk";
  const keyId = `${prefix}.${type}.${uniqueId}`;

  await getCloudflareContext().env.API_KEYS.put(keyId, JSON.stringify(key), {
    metadata: "{}",
  });

  return keyId;
};

export const getKeyNamesOwnedBy = async (id: string) => {
  const prefix = getUserPrefix(id);
  const listResult = await getCloudflareContext().env.API_KEYS.list({
    prefix,
    limit: MAX_API_KEYS,
  });

  return listResult.keys.map((key) => key.name);
};

export const getKeyById = async (key: string) => {
  const text = await getCloudflareContext().env.API_KEYS.get(key);
  return text ? (JSON.parse(text) as KeyData) : undefined;
};

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
  const validatedKeyData = await validateKeyInput(keyData);

  const session = await auth();
  if (!session?.user?.id || !session.user?.email) {
    return { ok: false, error: "Unauthorized" };
  }

  if (session.user.email.split("@")[1] !== "uci.edu") {
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

  const validatedKeyData = await validateKeyInput(keyData);
  const keyDataInPlace = await getKeyById(key);

  if (!keyDataInPlace) {
    throw new Error("key does not exist on user");
  }

  validatedKeyData.createdAt = keyDataInPlace.createdAt;

  await getCloudflareContext().env.API_KEYS.put(key, JSON.stringify(keyData), {
    metadata: "{}",
  });

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
