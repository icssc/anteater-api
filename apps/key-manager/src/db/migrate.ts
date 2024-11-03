import { dirname, join } from "node:path";
import { exit } from "node:process";
import { fileURLToPath } from "node:url";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { database } from "./index";

const __dirname = dirname(fileURLToPath(import.meta.url));

async function main() {
  const url = process.env.USERS_DB_URL;
  console.log(url);
  if (!url) throw new Error("Database URL not provided. Please check your .env file.");
  const db = database(url);
  await migrate(db, { migrationsFolder: join(__dirname, "./migrations") });
  exit(0);
}

main().then();
