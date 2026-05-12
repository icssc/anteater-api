import { exit } from "node:process";
import { database } from "@packages/db";
import { doSpringshareScrape } from "$lib";
import { doPVScrape } from "./pv";

async function main() {
	const url = process.env.DB_URL;
	if (!url) throw new Error("DB_URL not found");
	const db = database(url);
	let springshareError: unknown = null;
	let pvError: unknown = null;
	try {
		await doSpringshareScrape(db);
	} catch (err) {
		springshareError = err;
		console.error("Libraries + ALP scrape failed:", err);
	}
	try {
		await doPVScrape(db);
	} catch (err) {
		pvError = err;
		console.error("PV scrape failed:", err);
	}
	await db.$client.end();
	if (springshareError || pvError) {
		throw new Error("One or more scrapes failed");
	}
	exit(springshareError || pvError ? 1 : 0);
}

main().then();
