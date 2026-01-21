import type { database } from "@packages/db";
import type { InsertPeriod, RestaurantId } from "@packages/db/schema";
import { periods } from "@packages/db/schema";
import type { MealPeriodWithHours, Schedule } from "../models";
import { upsert } from "./utils";

export const upsertPeriod = async (db: ReturnType<typeof database>, period: InsertPeriod) =>
  await upsert(db, periods, period, {
    target: [periods.id, periods.date, periods.restaurantId],
    set: period,
  });

/**
 * Upserts periods for a specific date and restaurant
 */
export async function upsertPeriods(
  db: ReturnType<typeof database>,
  restaurantId: RestaurantId,
  dateString: string,
  dayOfWeek: number,
  mealPeriods: MealPeriodWithHours[],
): Promise<void> {
  const periodsResult = await Promise.allSettled(
    mealPeriods.map((period) =>
      upsertPeriod(db, {
        id: period.id.toString(),
        date: dateString,
        restaurantId,
        name: period.name,
        startTime: period.openHours[dayOfWeek] ?? "",
        endTime: period.closeHours[dayOfWeek] ?? "",
      }),
    ),
  );

  for (const period of periodsResult) {
    if (period.status === "rejected") {
      console.error("Failed to upsert period:", period.reason);
    }
  }
}

/**
 * Returns the current schedule for a date
 */
export function getCurrentSchedule(schedules: Schedule[], date: Date): Schedule {
  const current = schedules.find((schedule) => {
    if (!(schedule.startDate && schedule.endDate)) return false;
    return date >= schedule.startDate && date <= schedule.endDate;
  });

  const fallback = schedules.find((schedule) => schedule.type === "standard");

  const result = current ?? fallback;

  if (!result) {
    throw new Error("No valid schedule found for the given date, and no standard fallback exists.");
  }

  return result;
}
