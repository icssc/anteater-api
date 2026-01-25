import type { diningDish, diningNutritionInfo } from "@packages/db/schema";
import type z from "zod";
import { queryAdobeECommerce } from "../query.ts";
import {
  type GetLocationRecipesResponse,
  type RestaurantId,
  type RestaurantName,
  type Schedule,
  type WeekTimes,
  getLocationRecipesSchema,
  restaurantIds,
  restaurantNames,
  restaurantUrlMap,
} from "./model.ts";

export function restaurantIdFor(name: RestaurantName): RestaurantId {
  return restaurantIds[restaurantNames.findIndex((n) => n === name)];
}

/**
 * Takes in data in the form "Mo-Fr 07:15-11:00; Sa-Su 09:00-11:00"
 */
export function parseOpeningHours(hoursString: string): [WeekTimes, WeekTimes] {
  const DAY_MAP: { [key: string]: number } = {
    Su: 0,
    Mo: 1,
    Tu: 2,
    We: 3,
    Th: 4,
    Fr: 5,
    Sa: 6,
  };

  const openingTime: string[] = new Array(7).fill("");
  const closingTime: string[] = new Array(7).fill("");

  const timeBlocks = hoursString
    .split(";")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  for (const block of timeBlocks) {
    // Example: block = "Mo-Fr 07:15-11:00"
    const parts = block.split(/\s+/); // Split by one or more spaces

    if (parts.length < 2) {
      console.warn(`[parseOpeningHours]: Skipping invalid time block format: ${block}`);
      continue;
    }

    const dayRangeStr = parts[0]; // "Mo-Fr"
    const timeRangeStr = parts[1]; // "07:15-11:00 OR off"

    if (!dayRangeStr || !timeRangeStr) continue;

    // If the timeRange is off, then we need not do anything (it is not open)
    if (timeRangeStr === "off") continue;

    const [openTime, closeTime] = timeRangeStr.split("-"); // "07:15", "11:00"

    if (!openTime || !closeTime) {
      console.warn(`[parseOpeningHours]: Skipping block with incomplete time range: ${block}`);
      continue;
    }

    const dayIndices: number[] = [];

    // Case: Day Range (e.g., "Mo-Fr")
    if (dayRangeStr.includes("-")) {
      const dayParts = dayRangeStr.split("-");

      if (dayParts.length < 2) {
        console.warn(
          `[parseOpeningHours]: Skipping block with malformed day range: ${dayRangeStr}}`,
        );
        continue;
      }

      const startDay = dayParts[0];
      const endDay = dayParts[1];

      if (!startDay || !endDay) continue;

      const startIndex = DAY_MAP[startDay];
      const endIndex = DAY_MAP[endDay];

      if (startIndex === undefined || endIndex === undefined) {
        console.warn(`Skipping block with unknown day range: ${dayRangeStr}`);
        continue;
      }

      // handles if date range wraps around (i.e. Mo-Su)
      if (startIndex <= endIndex) {
        for (let i = startIndex; i <= endIndex; i++) dayIndices.push(i);
      } else {
        for (let i = startIndex; i < 7; i++) dayIndices.push(i);
        for (let i = 0; i <= endIndex; i++) dayIndices.push(i);
      }

      // Case: Single Day (e.g., "Mo")
    } else {
      const singleIndex = DAY_MAP[dayRangeStr];
      if (singleIndex !== undefined) {
        dayIndices.push(singleIndex);
      } else {
        console.warn(`Skipping block with unknown single day: ${dayRangeStr}`);
        continue;
      }
    }

    // Apply the times to the array indices
    for (const index of dayIndices) {
      openingTime[index] = openTime;
      closingTime[index] = closeTime;
    }
  }

  // Return the result, casting to the required fixed-length tuple type
  return [openingTime as WeekTimes, closingTime as WeekTimes];
}

/**
 * Returns the current schedule, if in a special meal schedule date/week.
 * Otherwise, defaults to standard schedule.
 * @param schedules a list of schedules to search
 * @param date the date of the schedule to get
 */
export function findCurrentlyActiveSchedule(schedules: Schedule[], date: Date): Schedule {
  return (
    schedules.find(
      (schedule) =>
        schedule.startDate &&
        schedule.endDate &&
        date >= schedule.startDate &&
        date <= schedule.endDate,
    ) ??
    // NOTE: We will assert that a standard schedule will always be returned...
    // if this no longer applies in the future, God help you.
    (schedules.find((schedule) => schedule.type === "standard") as Schedule)
  );
}

export type FetchedDish = {
  dish: typeof diningDish.$inferInsert;
  nutritionInfo: typeof diningNutritionInfo.$inferInsert;
  recipeAllergenCodes: Set<number>;
  recipePreferenceCodes: Set<number>;
};

export type DateDishMap = Map<string, FetchedDish[]>;

function toISODateString(d: Date) {
  const year = d.getFullYear();
  const month = (d.getMonth() + 1).toString().padStart(2, "0");
  const day = d.getDate().toString().padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export type GetLocationRecipesVariables = {
  date: string;
  locationUrlKey: "brandywine" | "the-anteatery";
  mealPeriod: number | null;
  viewType: "WEEKLY";
};

const getLocationRecipesQuery = `
query getLocationRecipes(
  $locationUrlKey: String!
  $date: String!
  $mealPeriod: Int
  $viewType: Commerce_MenuViewType!
) {
  getLocationRecipes(
    campusUrlKey: "campus"
    locationUrlKey: $locationUrlKey
    date: $date
    mealPeriod: $mealPeriod
    viewType: $viewType
  ) {
    locationRecipesMap {
      dateSkuMap {
        date
        stations {
          id
          skus {
            simple
          }
        }
      }
    }
    products {
      items {
        sku
        name
        images {
          url
        }
        attributes {
          name
          value
        }
      }
    }
  }
}
`;

type WeeklyProducts = NonNullable<
  GetLocationRecipesResponse["data"]["getLocationRecipes"]["products"]
>["items"];

type ProductAttributes = {
  name: string;
  description: string;
  category: string;
  ingredients: string;
  allergenIntolerances: Set<number>;
  recipePreferences: Set<number>;
  nutritionInfo: typeof diningNutritionInfo.$inferInsert;
};

type ProductDictionary = { [sku: string]: ProductAttributes };

/**
 * Parses the product attributes found in {@link WeeklyProducts} into a
 * more-conveniently accessible {@link ProductDictionary}
 * @param products An array of weekly products
 * @returns a dictionary associating the SKU of the product to its attributes
 */
function parseProducts(products: WeeklyProducts): ProductDictionary {
  const parsedProducts: ProductDictionary = {};

  for (const product of products) {
    const attributesMap = new Map(product.attributes.map((attr) => [attr.name, attr.value]));

    const unparsedIntolerances = attributesMap.get("allergens_intolerances");
    const allergenIntolerances: Set<number> = new Set<number>();

    // Allergen intolerances can either be one singular value or an array.
    if (Array.isArray(unparsedIntolerances)) {
      for (const code of unparsedIntolerances) {
        allergenIntolerances.add(Number.parseInt(code, 10));
      }
    } else {
      allergenIntolerances.add(Number.parseInt((unparsedIntolerances as string) ?? "0", 10));
    }

    const unparsedPreferences = attributesMap.get("recipe_attributes");
    const recipePreferences: Set<number> = new Set<number>();

    if (Array.isArray(unparsedPreferences)) {
      for (const code of unparsedPreferences) {
        recipePreferences.add(Number.parseInt(code, 10));
      }
    } else {
      recipePreferences.add(Number.parseInt((unparsedPreferences as string) ?? "0", 10));
    }

    const servingCombined = attributesMap.get("serving_combined") as string | undefined;
    const servingSize = servingCombined?.split(" ")[0];
    const servingUnit = servingCombined?.split(" ")[1];

    const nutritionInfo = {
      dishId: product.sku,
      calories: (attributesMap.get("calories") as string) ?? "",
      sodiumMg: (attributesMap.get("sodium") as string) ?? "",
      totalFatG: (attributesMap.get("total_fat") as string) ?? "",
      transFatG: (attributesMap.get("trans_fat") as string) ?? "",
      saturatedFatG: (attributesMap.get("saturated_fat") as string) ?? "",
      sugarsG: (attributesMap.get("sugars") as string) ?? "",
      ironMg: (attributesMap.get("iron") as string) ?? "",
      cholesterolMg: (attributesMap.get("cholesterol") as string) ?? "",
      totalCarbsG: (attributesMap.get("total_carbohydrates") as string) ?? "",
      dietaryFiberG: (attributesMap.get("dietary_fiber") as string) ?? "",
      proteinG: (attributesMap.get("protein") as string) ?? "",
      calciumMg: (attributesMap.get("calcium") as string) ?? "",
      vitaminAIU: (attributesMap.get("vitamin_a") as string) ?? "",
      vitaminCIU: (attributesMap.get("vitamin_c") as string) ?? "",
      servingSize: servingSize ?? "",
      servingUnit: servingUnit ?? "",
      // possible to get vitamins B and D and potassium in
      // attributes["recipe_additional_data"]
    } as typeof diningNutritionInfo.$inferInsert;

    parsedProducts[product.sku] = {
      name: product.name,
      description: (attributesMap.get("marketing_description") as string) ?? "",
      category: (attributesMap.get("master_recipe_type") as string) ?? "",
      ingredients: (attributesMap.get("recipe_ingredients") as string) ?? "",
      allergenIntolerances,
      recipePreferences,
      nutritionInfo,
    };
  }

  return parsedProducts;
}

/**
 * Fetches the Adobe ECommerce Menu specified for a week, starting at the date.
 * @param date the date for which to start getting the menus
 * @param restaurantName the restaurant for which to get the dishes
 * @param periodId the meal period to get the menus for
 * @returns returns a list of objects for each date
 */
export async function getAdobeEcommerceMenuWeekView(
  date: Date,
  restaurantName: RestaurantName,
  periodId: number,
): Promise<DateDishMap | null> {
  const getLocationRecipesVariables = {
    date: toISODateString(date),
    locationUrlKey: restaurantUrlMap[restaurantName],
    mealPeriod: periodId,
    viewType: "WEEKLY",
  } as GetLocationRecipesVariables;

  const res = await queryAdobeECommerce(getLocationRecipesQuery, getLocationRecipesVariables);

  const parsedData: z.infer<typeof getLocationRecipesSchema> = getLocationRecipesSchema.parse(res);
  const products = parsedData.data.getLocationRecipes.products;
  const locationRecipesMap = parsedData.data.getLocationRecipes.locationRecipesMap;

  if (products == null || locationRecipesMap == null) return null;

  const parsedProducts = parseProducts(products.items);
  const dateSkuMap = locationRecipesMap.dateSkuMap;

  const dishes: DateDishMap = new Map<string, FetchedDish[]>();

  for (const { date, stations } of dateSkuMap) {
    for (const { id: stationId, skus } of stations) {
      for (const sku of skus.simple) {
        const item = parsedProducts[sku];

        const dish = {
          dish: {
            id: sku,
            name: item?.name ?? "UNIDENTIFIED",
            stationId: stationId.toString(),
            description: item?.description ?? "",
            category: item?.category ?? "",
            ingredients: item?.ingredients ?? "",
          },
          nutritionInfo: item?.nutritionInfo ?? {},
          recipeAllergenCodes: item?.allergenIntolerances ?? new Set<number>(),
          recipePreferenceCodes: item?.recipePreferences ?? new Set<number>(),
        } as FetchedDish;

        const dishesForDate = dishes.get(date);
        if (dishesForDate) {
          dishesForDate.push(dish);
        } else {
          dishes.set(date, [dish]);
        }
      }
    }
  }

  return dishes;
}
