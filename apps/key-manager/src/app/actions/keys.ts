"use server";

import { createHash } from "node:crypto";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import type { KeyData } from "@packages/key-types";
import { type KeyInStorage, keyToMemory, keyToStorage } from "@packages/key-types/src/storage.ts";
import { createId } from "@paralleldrive/cuid2";
import type { Session } from "next-auth";
import { type CreateKeyFormValues, keyFormCodec, keyFormSchema } from "@/app/actions/types";
import { auth } from "@/auth";
import { MAX_API_KEYS } from "@/lib/utils";

function getUserPrefix(userId: string) {
  return createHash("sha256").update(userId).digest("base64url");
}

export async function keyFromFormToStorage(
  session: Session & { user: { id: string } },
  key: string | undefined,
  input: CreateKeyFormValues,
): Promise<KeyInStorage> {
  const keyInPlace = key ? await getKeyById(key) : undefined;

  const newDataAsStorage = keyToStorage(key, {
    ...keyFormCodec.decode(keyFormSchema.parse(input)),
    owner: session.user.id,
  });

  if (keyInPlace) {
    // if we are editing, do not allow update to createdAt
    newDataAsStorage.value.createdAt = keyInPlace.createdAt;
  }

  if (!session?.user.isAdmin) {
    // non-admin users may not modify these fields
    newDataAsStorage.value.rateLimitOverride = keyInPlace?.rateLimitOverride;
    newDataAsStorage.value.resources = keyInPlace?.resources;
  }

  return newDataAsStorage;
}

async function createKeyInner(userId: string, key: KeyInStorage) {
  const prefix = getUserPrefix(userId);
  const uniqueId = createId();
  const type = key.value._type === "publishable" ? "pk" : "sk";
  const keyId = `${prefix}.${type}.${uniqueId}`;

  await getCloudflareContext().env.API_KEYS.put(keyId, JSON.stringify(key.value), {
    metadata: key.metadata,
  });

  return keyId;
}

export async function getKeysOwnedBy(id: string) {
  const prefix = getUserPrefix(id);
  const listResult = await getCloudflareContext().env.API_KEYS.list<KeyInStorage["metadata"]>({
    prefix,
    limit: MAX_API_KEYS,
  });

  return listResult.keys.map((key) => key.name);
}

export async function getKeyById(keyId: string) {
  const got = await getCloudflareContext().env.API_KEYS.getWithMetadata<
    KeyInStorage["value"],
    KeyInStorage["metadata"]
  >(keyId, { type: "json" });

  return keyToMemory(
    // remove nullable
    got as KeyInStorage,
  );
}

export async function getKeysOwned() {
  const session = await auth();
  if (!session?.user?.id) {
    throw new Error("Unauthorized");
  }

  const keys = await getKeysOwnedBy(session.user.id);

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
      keyId: string;
      keyData: KeyData;
    };

export async function createKey(formData: CreateKeyFormValues): Promise<CreateUserApiKeyResult> {
  const session = await auth();

  if (!session?.user?.id || !session.user?.email) {
    return { ok: false, error: "Unauthorized" };
  }

  if (session.user.email.split("@")[1] !== "uci.edu" && !session.user.isAdmin) {
    return { ok: false, error: "User must have an @uci.edu email address" };
  }

  // due to guard above, id is present
  const asStorage = await keyFromFormToStorage(
    session as Session & { user: { id: string } },
    undefined,
    formData,
  );
  const userKeys = await getKeysOwnedBy(session.user.id);

  if (userKeys.length >= MAX_API_KEYS) {
    return { ok: false, error: "User at max API key limit" };
  }

  const key = await createKeyInner(session.user.id, asStorage);

  // no need to redact fields here
  return { ok: true, keyId: key, keyData: keyToMemory(asStorage) };
}

export async function editKey(keyId: string, keyData: CreateKeyFormValues) {
  const session = await auth();
  if (!session?.user?.id) {
    throw new Error("Unauthorized");
  }

  if ((await getCloudflareContext().env.API_KEYS.get(keyId)) === null) {
    throw new Error("key does not exist on user");
  }

  // due to guard above, id is present
  const asStorage = await keyFromFormToStorage(
    session as Session & { user: { id: string } },
    keyId,
    keyData,
  );

  await getCloudflareContext().env.API_KEYS.put(keyId, JSON.stringify(asStorage.value), {
    metadata: asStorage.metadata,
  });

  const asMemory = keyToMemory(asStorage);
  if (!session.user.isAdmin) {
    // user may not see these
    asMemory.resources = asMemory.rateLimitOverride = undefined;
  }
  return asMemory;
}

export async function deleteKeyById(keyId: string) {
  const session = await auth();
  if (!session?.user?.id) {
    throw new Error("Unauthorized");
  }

  const keys = await getKeysOwnedBy(session.user.id);

  if (!keys.includes(keyId)) {
    throw new Error("API key does not exist on user");
  }

  await getCloudflareContext().env.API_KEYS.delete(keyId);
}
