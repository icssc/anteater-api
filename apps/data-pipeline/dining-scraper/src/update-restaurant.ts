import type { database } from "@packages/db";
import { sql } from "@packages/db/drizzle";
import {
  diningDietRestriction,
  diningDish,
  diningDishToMenu,
  diningMenu,
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

  // Keep a set of all relevant meal periods (ones that were relevant throughout
  // at least some days in the week) to query weekly on later
  const periodSet = new Set<number>();
  const dayPeriodMap = new Map<string, Set<number>>();

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

    const dayPeriodSet = new Set<number>();
    for (const period of relevantMealPeriods) {
      periodSet.add(period.id);
      dayPeriodSet.add(period.id);

      const row = {
        id: period.id.toString(),
        date: dateString,
        restaurantId,
        name: period.name,
        startTime: period.openHours[dayOfWeekToFetch] ?? "",
        endTime: period.closeHours[dayOfWeekToFetch] ?? "",
        updatedAt,
      } satisfies typeof diningPeriod.$inferInsert;

      const key = `${row.id}|${row.date}|${row.restaurantId}`;
      periodsToUpsert.set(key, row);
    }
    dayPeriodMap.set(dateString, dayPeriodSet);
  }

  console.log(`Upserting ${periodsToUpsert.size} periods...`);
  await db
    .insert(diningPeriod)
    .values(Array.from(periodsToUpsert.values()))
    .onConflictDoUpdate({
      target: [diningPeriod.id, diningPeriod.date, diningPeriod.restaurantId],
      set: conflictUpdateSetAllCols(diningPeriod),
    });

  const menusToUpsert: (typeof diningMenu.$inferInsert)[] = [];
  const dishBundlesToInsert: {
    fetchedDish: FetchedDish;
    menuId: string;
    updatedAt: Date;
  }[] = [];

  await Promise.all(
    Array.from(periodSet).map(async (periodId) => {
      const periodUpdatedAt = new Date();
      const currentPeriodWeekly = await fetchMenuWeekView(today, restaurantId, periodId);

      if (!currentPeriodWeekly) {
        console.log(`Skipping period ${periodId}, period is null.`);
        return;
      }

      for (const [dateString, dishes] of currentPeriodWeekly.entries()) {
        // NOTE: For some head-scratching, infuriating reason, the API returns
        // dishes for a non-existent period that it doesn't have listed at a
        // certain day (i.e. No lunch on Saturdays, yet Lunch Meal period on
        // Saturdays returns some dishes), this is an issue because we now have to
        // make sure the period exists on the day for the returned data.
        // If the current date has this period, upsert, otherwise, skip.
        const periodsOfDay = dayPeriodMap.get(dateString);
        if (periodsOfDay && !periodsOfDay.has(periodId)) {
          continue;
        }

        const menuIdHash = `${restaurantId}|${dateString}|${periodId}`;
        menusToUpsert.push({
          id: menuIdHash,
          periodId: periodId.toString(),
          date: dateString,
          restaurantId,
          updatedAt: periodUpdatedAt,
        });

        for (const fetchedDish of dishes) {
          if (fetchedDish.dish.name !== "UNIDENTIFIED") {
            dishBundlesToInsert.push({
              fetchedDish: fetchedDish,
              menuId: menuIdHash,
              updatedAt: periodUpdatedAt,
            });
          }
        }
      }
    }),
  );

  if (menusToUpsert.length > 0) {
    console.log(`Upserting ${menusToUpsert.length} menus...`);
    await db
      .insert(diningMenu)
      .values(menusToUpsert)
      .onConflictDoUpdate({
        target: diningMenu.id,
        set: {
          periodId: sql`EXCLUDED.period_id`,
          date: sql`EXCLUDED.date`,
        },
      });
  }

  if (dishBundlesToInsert.length > 0) {
    console.log(`Processing ${dishBundlesToInsert.length} dish bundles into upserts...`);

    const dishesToUpsert = new Map<string, typeof diningDish.$inferInsert>();
    const dietRestrictionsToUpsert = new Map<string, typeof diningDietRestriction.$inferInsert>();
    const nutritionInfosToUpsert = new Map<string, typeof diningNutritionInfo.$inferInsert>();
    const dishToMenuRowsToUpsert = new Map<string, Set<string>>();
    let numDishToMenuRows = 0;

    type DietRestrictionBase = Omit<
      typeof diningDietRestriction.$inferInsert,
      "dishId" | "createdAt" | "updatedAt"
    >;
    for (const {
      fetchedDish: { dish, nutritionInfo, recipeAllergenCodes, recipePreferenceCodes },
      menuId,
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
      if (!dishToMenuRowsToUpsert.has(menuId)) {
        dishToMenuRowsToUpsert.set(menuId, new Set());
      }
      numDishToMenuRows += 1;
      dishToMenuRowsToUpsert.get(menuId)?.add(dish.id);
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
        .insert(diningDishToMenu)
        .values(
          dishToMenuRowsToUpsert
            .entries()
            .flatMap(([menuId, dishes]) =>
              dishes.keys().map((dishId) => {
                return {
                  menuId,
                  dishId,
                };
              }),
            )
            .toArray(),
        )
        .onConflictDoUpdate({
          target: [diningDishToMenu.dishId, diningDishToMenu.menuId],
          set: conflictUpdateSetAllCols(diningDishToMenu),
        });
    });
  }
}
