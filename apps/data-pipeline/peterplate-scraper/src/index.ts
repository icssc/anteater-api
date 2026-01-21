import { exit } from "node:process";
import { database } from "@packages/db";
import { getCurrentSchedule, upsertPeriods } from "./helpers/periods";
import { upsertAllRestaurants } from "./helpers/restaurants";
import { upsertAllStations } from "./helpers/stations";
import { getLocationInformation } from "./lib";

async function main() {
  const url = process.env.DB_URL;
  if (!url) throw new Error("DB_URL not found");

  const db = database(url);

  const today = new Date();
  const dateString = today.toISOString().split("T")[0]; // "2026-01-21"
  const dayOfWeek = today.getDay(); // 0-6

  await upsertAllRestaurants(db);

  const brandywineInfo = await getLocationInformation("brandywine", "ASC");
  // hardcoded 3056 for now
  await upsertAllStations(db, "3056", brandywineInfo.stationsInfo);

  const brandywineSchedule = getCurrentSchedule(brandywineInfo.schedules, today);
  const brandywinePeriods = brandywineSchedule.mealPeriods.filter(
    (period) => period.openHours[dayOfWeek] && period.closeHours[dayOfWeek],
  );
  await upsertPeriods(db, "3056", dateString, dayOfWeek, brandywinePeriods);

  const anteateryInfo = await getLocationInformation("the-anteatery", "ASC");
  await upsertAllStations(db, "3314", anteateryInfo.stationsInfo);

  const anteaterySchedule = getCurrentSchedule(anteateryInfo.schedules, today);
  const anteateryPeriods = anteaterySchedule.mealPeriods.filter(
    (period) => period.openHours[dayOfWeek] && period.closeHours[dayOfWeek],
  );
  await upsertPeriods(db, "3314", dateString, dayOfWeek, anteateryPeriods);

  exit(0);
}

main().then();
