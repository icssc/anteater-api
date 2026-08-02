import { database } from "@packages/db";
import { doScrape } from "$lib";

await doScrape(database(process.env.DB_URL ?? ""));
