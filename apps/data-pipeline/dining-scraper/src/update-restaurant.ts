import type { database } from "@packages/db";
import {
  diningDietRestriction,
  diningDish,
  diningDishToPeriod,
  diningNutritionInfo,
  diningPeriod,
  diningRestaurant,
  diningStation,
} from "@packages/db/schema";
import { conflictUpdateSetAllCols } from "@packages/db/utils";
import { format } from "date-fns";
import { fetchLocation } from "./fetch-location.ts";
import { type FetchedDish, fetchMenuWeekView } from "./fetch-menu-week-view.ts";
import { type RestaurantId, allergens, dietaryPreferences, restaurantIDToURL } from "./model.ts";
import { findCurrentlyActiveSchedule } from "./util.ts";

/**
 * Upserts the menu for the week starting at `date` for a restaurant, up until
 * the next Sunday.
 * @param db the Drizzle database instance
 * @param today will update using menus from this date to the next sunday, inclusive
 * @param restaurantId the restaurant to upsert the menu for ("anteatery", "brandywine")
 */
export async function updateRestaurant(
  db: ReturnType<typeof database>,
  today: Date,
  restaurantId: RestaurantId,
): Promise<void> {
  console.log(`Updating restaurant ${restaurantId}...`);

  const todayDayOfWeek = today.getDay();

  const updatedAt = new Date();

  // Get all the periods and stations available for the week.
  const restaurantInfo = await fetchLocation({
    locationUrlKey: restaurantIDToURL[restaurantId],
    sortOrder: "ASC",
  });

  await db
    .insert(diningRestaurant)
    .values({
      id: restaurantId,
      updatedAt,
    })
    .onConflictDoUpdate({
      target: diningRestaurant.id,
      set: conflictUpdateSetAllCols(diningRestaurant),
    });

  const stationsToUpsert = Object.keys(restaurantInfo.stationsInfo).map((id) => {
    return {
      id,
      restaurantId,
      name: restaurantInfo.stationsInfo[id],
      updatedAt,
    };
  });

  console.log(`Upserting ${stationsToUpsert.length} stations...`);
  await db
    .insert(diningStation)
    .values(stationsToUpsert)
    .onConflictDoUpdate({
      target: diningStation.id,
      set: conflictUpdateSetAllCols(diningStation),
    });

  const datesToFetch: Date[] = [];
  const daysUntilNextSunday = (7 - todayDayOfWeek) % 7 || 7;
  for (let i = 0; i <= daysUntilNextSunday; ++i) {
    const nextDate = new Date(today);
    nextDate.setDate(today.getDate() + i);
    datesToFetch.push(nextDate);
  }
  console.log(
    `Parsing info for ${datesToFetch.length} dates: ${datesToFetch.map((d) => format(d, "yyyy-MM-dd")).join(", ")}`,
  );

  const periodSet = new Set<number>();
  const dayToPeriods = new Map<string, Set<number>>();

  const periodsToUpsert = new Map<string, typeof diningPeriod.$inferInsert>();

  for (const dateToFetch of datesToFetch) {
    const dayOfWeekToFetch = dateToFetch.getDay();
    const currentSchedule = findCurrentlyActiveSchedule(restaurantInfo.schedules, dateToFetch);
    const dateString = format(dateToFetch, "yyyy-MM-dd");

    // Get relevant meal periods for the day to upsert into periods table
    const relevantMealPeriods = currentSchedule.mealPeriods.filter(
      (mealPeriod) =>
        mealPeriod.openHours[dayOfWeekToFetch] && mealPeriod.closeHours[dayOfWeekToFetch],
    );

    const periodsOnDay = new Set<number>();
    for (const period of relevantMealPeriods) {
      periodSet.add(period.id);
      periodsOnDay.add(period.id);

      const row = {
        adobeId: period.id,
        date: dateString,
        restaurantId,
        name: period.name,
        startTime: period.openHours[dayOfWeekToFetch] ?? "",
        endTime: period.closeHours[dayOfWeekToFetch] ?? "",
        updatedAt,
      } satisfies typeof diningPeriod.$inferInsert;

      const key = `${row.adobeId}|${row.date}|${row.restaurantId}`;
      periodsToUpsert.set(key, row);
    }
    dayToPeriods.set(dateString, periodsOnDay);
  }

  console.log(`Upserting ${periodsToUpsert.size} periods...`);
  const periodsInserted = await db
    .insert(diningPeriod)
    .values(Array.from(periodsToUpsert.values()))
    .onConflictDoUpdate({
      target: [diningPeriod.adobeId, diningPeriod.date, diningPeriod.restaurantId],
      set: conflictUpdateSetAllCols(diningPeriod),
    })
    .returning({
      id: diningPeriod.id,
      adobeId: diningPeriod.adobeId,
      date: diningPeriod.date,
      restaurantId: diningPeriod.restaurantId,
    });

  const dishBundlesToInsert: {
    fetchedDish: FetchedDish;
    periodId: string;
    updatedAt: Date;
  }[] = [];

  await Promise.all(
    // since we have our own surrogate UUID ID, let's call their number the "adobe ID"
    Array.from(periodSet).map(async (periodAdobeId) => {
      const periodUpdatedAt = new Date();
      const currentPeriodWeekly = await fetchMenuWeekView(today, restaurantId, periodAdobeId);

      if (!currentPeriodWeekly) {
        console.log(`Skipping period ${periodAdobeId}, period is null.`);
        return;
      }

      for (const [dateString, dishes] of currentPeriodWeekly.entries()) {
        // NOTE: For some head-scratching, infuriating reason, the API returns
        // dishes for a non-existent period that it doesn't have listed at a
        // certain day (i.e. No lunch on Saturdays, yet Lunch Meal period on
        // Saturdays returns some dishes), this is an issue because we now have to
        // make sure the period exists on the day for the returned data.
        // If the current date has this period, upsert, otherwise, skip.
        const periodsOfDay = dayToPeriods.get(dateString);
        if (periodsOfDay && !periodsOfDay.has(periodAdobeId)) {
          continue;
        }

        for (const fetchedDish of dishes) {
          if (fetchedDish.dish.name !== "UNIDENTIFIED") {
            dishBundlesToInsert.push({
              fetchedDish: fetchedDish,
              // this cast is ok because every periodAdobeId has a corresponding upserted row
              periodId: periodsInserted.find(
                ({ adobeId, date, restaurantId: rId }) =>
                  rId === restaurantId && date === dateString && adobeId === periodAdobeId,
              )?.id as string,
              updatedAt: periodUpdatedAt,
            });
          }
        }
      }
    }),
  );

  if (dishBundlesToInsert.length > 0) {
    console.log(`Processing ${dishBundlesToInsert.length} dish bundles into upserts...`);

    const dishesToUpsert = new Map<string, typeof diningDish.$inferInsert>();
    const dietRestrictionsToUpsert = new Map<string, typeof diningDietRestriction.$inferInsert>();
    const nutritionInfosToUpsert = new Map<string, typeof diningNutritionInfo.$inferInsert>();
    const dishToPeriodRowsToUpsert = new Map<string, Set<string>>();
    let numDishToMenuRows = 0;

    type DietRestrictionBase = Omit<
      typeof diningDietRestriction.$inferInsert,
      "dishId" | "createdAt" | "updatedAt"
    >;
    for (const {
      fetchedDish: { dish, nutritionInfo, recipeAllergenCodes, recipePreferenceCodes },
      periodId,
      updatedAt,
    } of dishBundlesToInsert) {
      // cast is safe because we update all containsX and isY for allergens x in X and restrictions y in Y
      const baseDietRestriction = {} as Partial<Omit<DietRestrictionBase, "dishId" | "updatedAt">>;

      // Parse available allergens and add to diet restriction if present
      for (const key of allergens) {
        const containsKey =
          `contains${key.replaceAll(" ", "")}` as keyof typeof baseDietRestriction;
        const allergenCode: number = restaurantInfo.allergenIntoleranceCodes[key] ?? -1;

        baseDietRestriction[containsKey] = recipeAllergenCodes.has(allergenCode);
      }

      // Parse available preferences and add to diet restriction if present
      for (const key of dietaryPreferences) {
        const isKey = `is${key.replaceAll(" ", "")}` as keyof typeof baseDietRestriction;
        const preferenceCode: number = restaurantInfo.menuPreferenceCodes[key] ?? -1;

        baseDietRestriction[isKey] = recipePreferenceCodes.has(preferenceCode);
      }

      // Compile diet restriction with dish ID
      const dietRestriction: typeof diningDietRestriction.$inferInsert = {
        dishId: dish.id,
        updatedAt,
        ...baseDietRestriction,
      };

      dishesToUpsert.set(dish.id, { ...dish, updatedAt });
      dietRestrictionsToUpsert.set(dish.id, dietRestriction);
      nutritionInfosToUpsert.set(dish.id, { ...nutritionInfo, updatedAt });
      if (!dishToPeriodRowsToUpsert.has(periodId)) {
        dishToPeriodRowsToUpsert.set(periodId, new Set());
      }
      numDishToMenuRows += 1;
      dishToPeriodRowsToUpsert.get(periodId)?.add(dish.id);
    }

    await db.transaction(async (tx) => {
      console.log(`Upserting ${dishesToUpsert.size} dishes...`);
      await tx
        .insert(diningDish)
        .values(dishesToUpsert.values().toArray())
        .onConflictDoUpdate({
          target: [diningDish.id],
          set: conflictUpdateSetAllCols(diningDish),
        });

      console.log(`Upserting ${dietRestrictionsToUpsert.size} dietary restriction entries...`);
      await tx
        .insert(diningDietRestriction)
        .values(dietRestrictionsToUpsert.values().toArray())
        .onConflictDoUpdate({
          target: [diningDietRestriction.dishId],
          set: conflictUpdateSetAllCols(diningDietRestriction),
        });

      console.log(`Upserting ${nutritionInfosToUpsert.size} nutrition info entries...`);
      await tx
        .insert(diningNutritionInfo)
        .values(nutritionInfosToUpsert.values().toArray())
        .onConflictDoUpdate({
          target: [diningNutritionInfo.dishId],
          set: conflictUpdateSetAllCols(diningNutritionInfo),
        });

      console.log(`Upserting ${numDishToMenuRows} dish-to-menu rows...`);
      await tx
        .insert(diningDishToPeriod)
        .values(
          dishToPeriodRowsToUpsert
            .entries()
            .flatMap(([periodId, dishes]) =>
              dishes.keys().map((dishId) => {
                return {
                  periodId,
                  dishId,
                };
              }),
            )
            .toArray(),
        )
        .onConflictDoUpdate({
          target: [diningDishToPeriod.dishId, diningDishToPeriod.periodId],
          set: conflictUpdateSetAllCols(diningDishToPeriod),
        });
    });
  }
}
