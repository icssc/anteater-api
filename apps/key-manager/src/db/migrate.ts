import { dirname, join } from "node:path";
import * as process from "node:process";
import { exit } from "node:process";
import { fileURLToPath } from "node:url";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import readlineSync from "readline-sync";
import { database } from "./index";

const __dirname = dirname(fileURLToPath(import.meta.url));

async function main() {
  const url = process.env.USERS_DB_URL;
  if (!url) throw new Error("Database URL not provided. Please check your .env file.");
  // Safety check if you are manually running a migration on a non local database
  if (!url.includes("localhost") && process.env.GITHUB_ACTIONS !== "true") {
    if (
      !readlineSync.keyInYNStrict(
        "Warning. You are attempting to run a database migration on a non local database. Do you wish to proceed?",
      )
    ) {
      console.log("Cancelling migration.");
      exit(1);
    }
  }
  const db = database(url);
  await migrate(db, { migrationsFolder: join(__dirname, "./migrations") });
  exit(0);
}

main().then();
