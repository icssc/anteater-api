import { createHash } from "node:crypto";
import { auth } from "@/auth";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { createId } from "@paralleldrive/cuid2";

const getUserPrefix = (userId: string) => {
  const hash = createHash("sha256");
  const prefix = hash.update(userId).digest("base64url");

  return prefix;
};

const createUserKey = async (userId: string) => {
  const prefix = getUserPrefix(userId);
  const type = "sk";
  const uniqueId = createId();

  const ctx = await getCloudflareContext();
  await ctx.env.API_KEYS.put(`${prefix}:${type}:${uniqueId}`, "");
};

/**
 * Returns the user's API key
 *
 * @param id user's id
 * @return the user's api key if it exists, otherwise null
 */
const getUserKey = async (id: string) => {
  const ctx = await getCloudflareContext();

  await ctx.env.API_KEYS.list({ prefix: getUserPrefix(id), limit: 1 });
};

/**
 * TODO Return the authed user's api key
 */
export const GET = async () => {
  const session = await auth();
  if (!session || !session.user?.id) {
    // TODO 401
  }

  const ctx = await getCloudflareContext();
  ctx.env.API_KEYS;

  // TODO get key
};

/**
 * TODO Create the authed user's api key
 */
export const POST = async () => {
  const session = await auth();
  if (!session || !session.user?.id) {
    // TODO 401
    return null;
  }

  if ((await getUserKey(session.user.id)) != null /** TODO user already has key*/) {
    // TODO prevent creating another key
  }

  const ctx = await getCloudflareContext();

  // TODO create key
  await createUserKey(session.user.id);

  // TODO return okay response
};

/**
 * TODO Delete the authed user's api key
 */
export const DELETE = async () => {
  const session = await auth();
  if (!session || !session.user?.id) {
    // TODO 401
    return null;
  }

  if ((await getUserKey(session.user.id)) == null /** TODO user does not have key*/) {
    // TODO prevent deleting non-existent key
  }

  const ctx = await getCloudflareContext();

  // TODO create key
};
