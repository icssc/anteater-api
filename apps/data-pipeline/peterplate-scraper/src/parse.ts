import { writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import axios, { type AxiosError, type AxiosResponse } from "axios";
import winston from "winston";
import { z } from "zod";
export const __filename = fileURLToPath(import.meta.url);
export const __dirname = path.dirname(__filename);
export async function getLocationInformation(
  location: GetLocationQueryVariables["locationUrlKey"],
  sortOrder: GetLocationQueryVariables["sortOrder"],
): Promise<DiningHallInformation> {
  const getLocationVariables = {
    locationUrlKey: location,
    sortOrder: sortOrder,
  } as GetLocationQueryVariables;

  const response = await queryAdobeECommerce(getLocationQuery, getLocationVariables);

  const parsedData: LocationInfo = GetLocationSchema.parse(response.data);

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
  const allergenItem = commerceAttributesList.items.find(
    (item) => item.code === "allergens_intolerances",
  );
  if (allergenItem) {
    for (const option of allergenItem.options) {
      allergenIntoleranceCodes[option.label] = Number.parseInt(option.value);
    }
  }

  const menuPreferenceCodes: DiningHallInformation["menuPreferenceCodes"] = {};
  const commerceAttributesItem = commerceAttributesList.items.find(
    (item) => item.code === "menu_preferences",
  );

  if (commerceAttributesItem) {
    for (const option of commerceAttributesItem.options) {
      menuPreferenceCodes[option.label] = Number.parseInt(option.value);
    }
  }

  const stationsInfo: { [id: string]: string } = {};
  const commerceAttributesChildren = getLocation.commerceAttributes.children;
  if (commerceAttributesChildren) {
    for (const station of commerceAttributesChildren) {
      stationsInfo[station.id] = station.name;
    }
  }

  return {
    allergenIntoleranceCodes,
    menuPreferenceCodes,
    stationsInfo,
    schedules: parsedSchedules,
  };
}

export const defaultFormat = [
  winston.format.timestamp(),
  winston.format.printf((info) => `[${info.timestamp} ${info.level}] ${info.message}`),
];
export const logger = winston.createLogger({
  level: "info",
  format: winston.format.combine(...defaultFormat),
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(winston.format.colorize(), ...defaultFormat),
    }),
    new winston.transports.File({
      filename: `${__dirname}/../logs/${Date.now()}.log`,
    }),
  ],
});
export type Schedule = {
  name: string;
  type: string;
  startDate?: Date;
  endDate?: Date;
  mealPeriods: MealPeriodWithHours[];
};
export const GetLocationSchema = z.object({
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
        maxMenusDate: z.string().date(),
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
              start_date: z.string().date().optional(),
              end_date: z.string().date().optional(),
            }),
          ),
        }),
      }),
    }),
  }),
});
export type LocationInfo = z.infer<typeof GetLocationSchema>;
export type MealPeriod = LocationInfo["data"]["Commerce_mealPeriods"][0];
export type WeekTimes = [string, string, string, string, string, string, string];
export type MealPeriodWithHours = MealPeriod & {
  // The hours for which the meal period opens (e.g. openHours[day] = "11:00")
  openHours: WeekTimes;
  // The hours for which the meal period occurs (e.g. openHours[day] = "14:00")
  closeHours: WeekTimes;
};
export type GetLocationQueryVariables = {
  locationUrlKey: "brandywine" | "the-anteatery";
  sortOrder: "ASC" | "DESC";
};
export type DiningHallInformation = {
  // Maps the allergen (e.g. "Eggs") to its code (39)
  allergenIntoleranceCodes: { [allergen: string]: number };
  // Maps the preference (e.g. "Gluten Free") to its code (78)
  menuPreferenceCodes: { [preference: string]: number };
  // Maps the id of the station to station name
  stationsInfo: { [uid: string]: string };
  // Schedules (special and standard) for this dining hall
  schedules: Schedule[];
};
export const getLocationQuery = `
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
export const graphQLEndpoint: string =
  "https://api.elevate-dxp.com/api/mesh/c087f756-cc72-4649-a36f-3a41b700c519/graphql?";
export const graphQLHeaders = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:141.0) Gecko/20100101 Firefox/141.0",
  Referer: "https://uci.mydininghub.com/",
  "content-type": "application/json",
  store: "ch_uci_en",
  "magento-store-code": "ch_uci",
  "magento-website-code": "ch_uci",
  "magento-store-view-code": "ch_uci_en",
  "x-api-key": "ElevateAPIProd",
  Origin: "https://uci.mydininghub.com",
};
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
    if (!dayRangeStr || !timeRangeStr) {
      logger.warn(`[parseOpeningHours] Skipping malformed time block: "${block}"`); //this is not native to peterplate api!!
      continue;
    }

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
      if (!startDay || !endDay) {
        logger.warn(`[parseOpeningHours] Skipping malformed day range: "${dayRangeStr}"`); //this is not native to peterplate api!!
        continue;
      }
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
export async function queryAdobeECommerce(
  query: string,
  variables: object,
): Promise<AxiosResponse> {
  try {
    const response = await axios({
      method: "get",
      url: graphQLEndpoint,
      headers: graphQLHeaders,
      params: {
        query: query,
        variables: JSON.stringify(variables),
      },
    });

    type ResponseWithQuery = AxiosResponse["data"] & {
      query: string;
      params: string;
    };
    const loggedResponse: ResponseWithQuery = {
      ...response.data,
      query: query,
      params: variables,
    };

    if (process.env.IS_LOCAL) {
      const outPath = `query-${new Date().toISOString().replace(/:/g, "-")}-response.json`;
      writeFileSync(`./${outPath}`, JSON.stringify(loggedResponse), {
        flag: "w",
      });
      logger.info(`[query] Wrote AdobeEcommerce response to ${process.cwd()}/${outPath}.`);
    }

    return response;
  } catch (err: unknown) {
    console.error("GraphQL ERROR in queryAdobeECommerce:");

    if (axios.isAxiosError(err)) {
      const aErr = err as AxiosError;
      console.error("Axios message:", aErr.message);
      if (aErr.code) {
        console.error("Error code:", aErr.code);
      }
      console.error("HTTP status:", aErr.response?.status);
      console.error("Response body:", aErr.response?.data);
      // If no response, show the request info
      if (aErr.code) {
        console.error("Error code:", aErr.code);
      }
    } else {
      console.error(err);
    }

    throw err;
  }
}

export async function getAdobeEcommerceMenuDaily(
  date: Date,
  restaurantName: RestaurantName,
  periodId: number,
): Promise<InsertDishWithModifiedRelations[]> {
  const getLocationRecipesVariables = {
    date: toISODateString(date),
    locationUrlKey: restaurantUrlMap[restaurantName],
    mealPeriod: periodId,
    viewType: "DAILY",
  } as GetLocationRecipesDailyVariables;

  const res = await queryAdobeECommerce(GetLocationRecipesDailyQuery, getLocationRecipesVariables);

  const parsedData: LocationRecipesDaily = GetLocationRecipesDailySchema.parse(res.data);

  const products = parsedData.data.getLocationRecipes.products;
  const locationRecipesMap = parsedData.data.getLocationRecipes.locationRecipesMap;

  // Return empty array if no data is available for this meal period
  if (products == null || locationRecipesMap == null) return [];

  const parsedProducts = parseProducts(products.items);
  const stationSkuMap = locationRecipesMap.stationSkuMap;

  // Map all of the items from each station into a list of dishes
  return stationSkuMap.flatMap((station) =>
    station.skus.map((sku) => {
      const item = parsedProducts[sku];

      return {
        id: sku,
        name: item?.name ?? "UNIDENTIFIED",
        stationId: station.id.toString(),
        description: item?.description ?? "",
        category: item?.category ?? "",
        ingredients: item?.ingredients ?? "",
        nutritionInfo: item?.nutritionInfo ?? {},
        recipeAllergenCodes: item?.allergenIntolerances ?? new Set<number>(),
        recipePreferenceCodes: item?.recipePreferences ?? new Set<number>(),
      } as InsertDishWithModifiedRelations;
    }),
  );
}

export const restaurantIds = ["3056", "3314"] as const;
export const restaurantNames = ["anteatery", "brandywine"] as const;

export type RestaurantId = (typeof restaurantIds)[number];
export type RestaurantName = (typeof restaurantNames)[number];

export const getRestaurantId = (name: RestaurantName): RestaurantId =>
  name === "anteatery" ? "3056" : "3314";

export const getRestaurantNameById = (id: RestaurantId): RestaurantName =>
  id === "3056" ? "anteatery" : "brandywine";

const toISODateString = (d: Date) => {
  const year = d.getFullYear();
  const month = (d.getMonth() + 1).toString().padStart(2, "0");
  const day = d.getDate().toString().padStart(2, "0");
  return `${year}-${month}-${day}`;
};

type GetLocationRecipesDailyVariables = {
  date: string;
  locationUrlKey: "brandywine" | "the-anteatery";
  mealPeriod: number | null;
  viewType: "DAILY";
};

const restaurantUrlMap = {
  anteatery: "the-anteatery",
  brandywine: "brandywine",
} as const;

const GetLocationRecipesDailyQuery = `
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
      stationSkuMap {
        id
        skus
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

type LocationRecipesDaily = z.infer<typeof GetLocationRecipesDailySchema>;

const GetLocationRecipesDailySchema = z.object({
  data: z.object({
    getLocationRecipes: z.object({
      locationRecipesMap: z
        .object({
          stationSkuMap: z.array(
            z.object({
              id: z.number(),
              skus: z.array(z.string()).nonempty(),
            }),
          ),
        })
        .nullable(),
      products: z
        .object({
          items: z.array(
            z.object({
              sku: z.string(),
              name: z.string(),
              images: z.array(
                z.object({
                  url: z.string(),
                }),
              ),
              attributes: z.array(
                z.object({
                  name: z.string(),
                  value: z.union([z.string(), z.array(z.string())]),
                }),
              ),
            }),
          ),
        })
        .nullable(),
    }),
  }),
});

function parseProducts(products: WeeklyProducts): ProductDictionary {
  const parsedProducts: ProductDictionary = {};
  for (const product in products) {
    const attributesMap = new Map(product.attributes.map((attr) => [attr.name, attr.value]));

    const unparsedIntolerances = attributesMap.get("allergens_intolerances");
    const allergenIntolerances: Set<number> = new Set<number>();

    // Allergen intolerances can either be one singular value or an array.
    if (Array.isArray(unparsedIntolerances)) {
      for (const code in unparsedIntolerances) {
        allergenIntolerances.add(Number.parseInt(code, 10));
      }
    } else {
      allergenIntolerances.add(Number.parseInt((unparsedIntolerances as string) ?? "0", 10));
    }

    const unparsedPreferences = attributesMap.get("recipe_attributes");
    const recipePreferences: Set<number> = new Set<number>();

    if (Array.isArray(unparsedPreferences)) {
      for (const code in unparsedPreferences) {
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
    } as InsertDishWithRelations["nutritionInfo"];

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

type InsertDishWithModifiedRelations = InsertDish & {
  nutritionInfo: InsertDishWithRelations["nutritionInfo"];
  recipeAllergenCodes: Set<number>;
  recipePreferenceCodes: Set<number>;
};

interface InsertDishWithRelations extends InsertDish {
  dietRestriction: InsertDietRestriction;
  nutritionInfo: InsertNutritionInfo;
}
type InsertDish = typeof dishes.$inferInsert;
export type SelectDish = typeof dishes.$inferSelect;
