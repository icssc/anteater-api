import type { diningDish, diningNutritionInfo } from "@packages/db/schema";
import z from "zod";
import { type RestaurantName, restaurantUrlMap } from "./model.ts";
import { queryAdobeECommerce } from "./query.ts";

const getLocationRecipesSchema = z.object({
  data: z.object({
    getLocationRecipes: z.object({
      locationRecipesMap: z
        .object({
          dateSkuMap: z.array(
            z.object({
              date: z.iso.date(),
              stations: z.array(
                z.object({
                  id: z.number(),
                  skus: z.object({
                    simple: z.array(z.string()),
                  }),
                }),
              ),
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

type GetLocationRecipesResponse = z.infer<typeof getLocationRecipesSchema>;

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

  const queried = await queryAdobeECommerce(
    getLocationRecipesQuery,
    getLocationRecipesVariables,
    getLocationRecipesSchema,
  );
  if (queried === null) {
    throw new Error(
      `Could not getAdobeEcommerceMenuWeekView for date ${date}, restaurant name ${restaurantName}, period ID ${periodId}`,
    );
  }

  const products = queried.data.getLocationRecipes.products;
  const locationRecipesMap = queried.data.getLocationRecipes.locationRecipesMap;

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
