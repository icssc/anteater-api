import z from "zod";
import type { DiningHallInformation, MealPeriodWithHours, Schedule } from "./model.ts";
import { queryAdobeECommerce } from "./query.ts";
import { parseOpeningHours } from "./util.ts";

export type FetchLocationVariables = {
  locationUrlKey: "brandywine" | "the-anteatery";
  sortOrder: "ASC" | "DESC";
};

const fetchLocationResponseSchema = z.object({
  data: z.object({
    Commerce_mealPeriods: z.array(
      z.object({
        name: z.string(),
        id: z.number(),
        position: z.number(),
      }),
    ),
    Commerce_attributesList: z.object({
      items: z.array(
        z.object({
          code: z.string(),
          options: z.array(
            z.object({
              value: z.string(),
              label: z.string(),
            }),
          ),
        }),
      ),
    }),
    getLocation: z.object({
      commerceAttributes: z.object({
        maxMenusDate: z.iso.date(),
        children: z.array(
          z.object({
            id: z.number(),
            uid: z.string(),
            name: z.string(),
            position: z.number(),
          }),
        ),
      }),
      aemAttributes: z.object({
        hoursOfOperation: z.object({
          schedule: z.array(
            z.object({
              id: z.string(),
              name: z.string(),
              type: z.string(),
              meal_periods: z.array(
                z.object({
                  meal_period: z.string(),
                  opening_hours: z.string(),
                }),
              ),
              start_date: z.iso.date().optional(),
              end_date: z.iso.date().optional(),
            }),
          ),
        }),
      }),
    }),
  }),
});

export type LocationResponse = z.infer<typeof fetchLocationResponseSchema>;

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
  const queried = await queryAdobeECommerce(
    fetchLocationQuery,
    variables,
    fetchLocationResponseSchema,
  );
  if (queried === null) {
    throw Error(
      `Could not fetchLocation with key ${variables.locationUrlKey} and sort direction ${variables.sortOrder}`,
    );
  }

  const getLocation = queried.data.getLocation;
  const commerceMealPeriods = queried.data.Commerce_mealPeriods;
  const commerceAttributesList = queried.data.Commerce_attributesList;
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
