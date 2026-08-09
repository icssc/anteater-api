import { database } from "@packages/db";
import { runStandaloneScrape } from "./standalone.js";

await runStandaloneScrape(database(process.env.DB_URL ?? ""));
