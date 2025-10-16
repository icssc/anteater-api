import type { DrizzleConfig } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";

export const database = <TSchema extends Record<string, unknown>>(
  url: string,
  params?: DrizzleConfig<TSchema>,
) => drizzle({ connection: { url, max: 1 }, ...params });
