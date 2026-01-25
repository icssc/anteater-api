import type { database } from "@packages/db";
import { sql } from "@packages/db/drizzle";
import { diningMenu, diningPeriod, diningRestaurant, diningStation } from "@packages/db/schema";
import { conflictUpdateSetAllCols } from "@packages/db/utils";
import { format } from "date-fns";
import { queryAdobeECommerce } from "../query.ts";
import {
  type DiningHallInformation,
  type FetchLocationVariables,
  type MealPeriodWithHours,
  type RestaurantName,
  type Schedule,
  fetchLocationResponseSchema,
  restaurantUrlMap,
} from "./model.ts";
import {
  type FetchedDish,
  findCurrentlyActiveSchedule,
  getAdobeEcommerceMenuWeekView,
  parseOpeningHours,
  restaurantIdFor,
} from "./util.ts";

const fetchLocationQuery = `
query getLocation(
  $locationUrlKey: String!
  $sortOrder: Commerce_SortOrderEnum
) {
  getLocation(campusUrlKey: "campus", locationUrlKey: $locationUrlKey) {
    commerceAttributes {
      maxMenusDate
      children {
        id
        uid
        name
        position
      }
    }
    aemAttributes {
      hoursOfOperation {
        schedule
      }
      name
    }
  }
  Commerce_mealPeriods(sort_order: $sortOrder) {
    name
    id
    position
  }
  Commerce_attributesList(entityType: CATALOG_PRODUCT) {
    items {
      code
      options {
        value
        label
      }
    }
  }
}
`;

/**
 * Gets the information associated with a restaurant location, such as
 * hours of operation, allergen intolerance codes, etc.
 * @returns @see{@link DiningHallInformation}
 */
export async function fetchLocation(
  variables: FetchLocationVariables,
): Promise<DiningHallInformation> {
  const response = await queryAdobeECommerce(fetchLocationQuery, variables);

  const parsedData = fetchLocationResponseSchema.parse(response);

  const getLocation = parsedData.data.getLocation;
  const commerceMealPeriods = parsedData.data.Commerce_mealPeriods;
  const commerceAttributesList = parsedData.data.Commerce_attributesList;
  const schedules = getLocation.aemAttributes.hoursOfOperation.schedule;

  // Get all of the schedules
  const parsedSchedules: Schedule[] = schedules.map((schedule) => {
    const scheduleMealPeriods: MealPeriodWithHours[] = schedule.meal_periods.map((mealPeriod) => {
      const mealPeriodInfo = commerceMealPeriods.find((cmp) => cmp.name === mealPeriod.meal_period);

      const [openHours, closeHours] = parseOpeningHours(mealPeriod.opening_hours);

      return {
        name: mealPeriod.meal_period,
        id: mealPeriodInfo?.id ?? "UNIDENTIFIED",
        position: mealPeriodInfo?.position ?? 0,
        openHours,
        closeHours,
      } as MealPeriodWithHours;
    });

    return {
      name: schedule.name,
      type: schedule.type,
      startDate: schedule.start_date,
      endDate: schedule.end_date,
      mealPeriods: scheduleMealPeriods,
    } as Schedule;
  });

  const allergenIntoleranceCodes: DiningHallInformation["allergenIntoleranceCodes"] = {};
  for (const item of commerceAttributesList.items.find(
    (item) => item.code === "allergens_intolerances",
  )?.options ?? []) {
    allergenIntoleranceCodes[item.label] = Number.parseInt(item.value, 10);
  }

  const menuPreferenceCodes: DiningHallInformation["menuPreferenceCodes"] = {};
  for (const item of commerceAttributesList.items.find((item) => item.code === "menu_preferences")
    ?.options ?? []) {
    menuPreferenceCodes[item.label] = Number.parseInt(item.value, 10);
  }

  const stationsInfo: { [id: string]: string } = {};
  for (const station of getLocation.commerceAttributes.children) {
    stationsInfo[station.id] = station.name;
  }

  return {
    allergenIntoleranceCodes,
    menuPreferenceCodes,
    stationsInfo,
    schedules: parsedSchedules,
  };
}

/**
 * Upserts the menu for the week starting at `date` for a restaurant, up until
 * the next Sunday.
 * @param db the Drizzle database instance
 * @param today will update using menus from this date to the next sunday, inclusive
 * @param restaurantName the restaurant to upsert the menu for ("brandywine", "anteatery")
 */
export async function updateRestaurant(
  db: ReturnType<typeof database>,
  today: Date,
  restaurantName: RestaurantName,
): Promise<void> {
  const restaurantId = restaurantIdFor(restaurantName);
  const todayDayOfWeek = today.getDay();

  const updatedAt = new Date();

  // Get all the periods and stations available for the week.
  const restaurantInfo: DiningHallInformation = await fetchLocation({
    locationUrlKey: restaurantUrlMap[restaurantName],
    sortOrder: "ASC",
  });

  await db
    .insert(diningRestaurant)
    .values({
      id: restaurantId,
      name: restaurantName,
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

  const datesToFetch: Date[] = [today];
  const daysUntilNextSunday = (7 - todayDayOfWeek) % 7 || 7;
  for (let i = 0; i <= daysUntilNextSunday; ++i) {
    const nextDate = new Date(today);
    nextDate.setDate(today.getDate() + i);
    datesToFetch.push(nextDate);
  }

  // Keep a set of all relevant meal periods (ones that were relevant throughout
  // at least some days in the week) to query weekly on later
  const periodSet: Set<number> = new Set<number>();

  const dayPeriodMap = new Map<string, Set<number>>();

  await Promise.all(
    datesToFetch.map(async (dateToFetch) => {
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
      }

      dayPeriodMap.set(dateString, dayPeriodSet);

      console.log(`Upserting ${relevantMealPeriods.length} periods...`);
      const periodsToUpsert = relevantMealPeriods.map((period) => {
        return {
          id: period.id.toString(),
          date: dateString,
          restaurantId: restaurantId,
          name: period.name,
          startTime: period.openHours[dayOfWeekToFetch] ?? "",
          endTime: period.closeHours[dayOfWeekToFetch] ?? "",
          updatedAt,
        };
      });

      await db
        .insert(diningPeriod)
        .values(periodsToUpsert)
        .onConflictDoUpdate({
          target: [diningPeriod.id, diningPeriod.date, diningPeriod.restaurantId],
          set: conflictUpdateSetAllCols(diningPeriod),
        });
    }),
  );

  const menusToUpsert: (typeof diningMenu.$inferInsert)[] = [];
  const dishesToUpsert: {
    dish: FetchedDish;
    menuId: string;
  }[] = [];

  await Promise.all(
    Array.from(periodSet).map(async (periodId) => {
      const periodUpdatedAt = new Date();
      const currentPeriodWeekly = await getAdobeEcommerceMenuWeekView(
        today,
        restaurantName,
        periodId,
      );

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
            dishesToUpsert.push({
              dish: fetchedDish,
              menuId: menuIdHash,
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

  if (dishesToUpsert.length > 0) {
    console.log(`Upserting ${dishesToUpsert.length} dishes...`);

    for (const dish of dishesToUpsert) {
    }
    //
    // await Promise.allSettled(
    //   dishesToUpsert.map(
    //     async (d) => await parseAndUpsertDish(db, restaurantInfo, d.dish, d.menuId),
    //   ),
    // );
  }
}
