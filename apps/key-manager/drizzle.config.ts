import { defineConfig } from "drizzle-kit";

if (!process.env.USERS_DB_URL) {
  throw new Error("DB_URL is required");
}

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./src/db/migrations",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.USERS_DB_URL,
  },
});
