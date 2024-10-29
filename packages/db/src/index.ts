import { drizzle } from "drizzle-orm/postgres-js";

export const database = (url: string) => drizzle(url);
