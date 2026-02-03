import { z } from "@hono/zod-openapi";

export const diningEventQuerySchema = z.object({
  restaurantId: z.string().optional().openapi({
    example: "3056",
    description: "Filter events by restaurant ID",
  }),
});

export const diningDishQuerySchema = z.object({
  id: z.string().openapi({
    example: "1923_101628_M35424_1_13208",
    description: "Unique dish identifier from dining system",
  }),
});

export const eventSchema = z.object({
  title: z.string().openapi({ example: "Lunar New Year Celebration" }),
  image: z.string().nullable().openapi({ description: "URL to event promotional image" }),
  restaurantId: z.string().openapi({
    example: "3056",
    description: "Unique identifier for the restaurant hosting this event",
  }),
  longDescription: z.string().nullable(),
  // transforms Date objects in db to ISO 8601 strings (I hope)
  start: z.coerce.date().transform((d) => d?.toISOString()),
  end: z.coerce
    .date()
    .nullable()
    .transform((d) => d?.toISOString() ?? null),
  updatedAt: z.coerce.date().transform((d) => d.toISOString()),
});

export const dietRestrictionSchema = z.object({
  dishId: z.string(),
  containsEggs: z.boolean().nullable(),
  containsFish: z.boolean().nullable(),
  containsMilk: z.boolean().nullable(),
  containsPeanuts: z.boolean().nullable(),
  containsSesame: z.boolean().nullable(),
  containsShellfish: z.boolean().nullable(),
  containsSoy: z.boolean().nullable(),
  containsTreeNuts: z.boolean().nullable(),
  containsWheat: z.boolean().nullable(),
  isGlutenFree: z.boolean().nullable(),
  isHalal: z.boolean().nullable(),
  isKosher: z.boolean().nullable(),
  isLocallyGrown: z.boolean().nullable(),
  isOrganic: z.boolean().nullable(),
  isVegan: z.boolean().nullable(),
  isVegetarian: z.boolean().nullable(),
  // the updatedAt value is somewhat redundant, as it should be almost identical to the field of its dish
});

export const nutritionInfoSchema = z.object({
  dishId: z.string(),
  servingSize: z.string().nullable(),
  servingUnit: z.string().nullable(),
  calories: z.string().nullable(),
  totalFatG: z.string().nullable(),
  transFatG: z.string().nullable(),
  saturatedFatG: z.string().nullable(),
  cholesterolMg: z.string().nullable(),
  sodiumMg: z.string().nullable(),
  totalCarbsG: z.string().nullable(),
  dietaryFiberG: z.string().nullable(),
  sugarsG: z.string().nullable(),
  proteinG: z.string().nullable(),
  calciumMg: z.string().nullable(),
  ironMg: z.string().nullable(),
  vitaminAIU: z.string().nullable(),
  vitaminCIU: z.string().nullable(),
  // the updatedAt value is somewhat redundant, as it should be almost identical to the field of its dish
});

export const dishSchema = z.object({
  id: z.string().openapi({ example: "1923_101628_M35424_1_13208" }),
  stationId: z.string().openapi({
    example: "1935",
    description: "ID of the station serving this dish",
  }),
  name: z.string().openapi({
    example: "Grilled Chicken Breast",
    description: "Name of the dish",
  }),
  description: z.string().openapi({ example: "Seasoned and grilled chicken" }),
  ingredients: z.string().nullable().openapi({ example: "Chicken, salt, pepper" }),
  category: z.string().openapi({
    example: "Saute",
    description: "Category of the dish",
  }),
  updatedAt: z.coerce.date().transform((d) => d?.toISOString()),
  // are these nullable?
  dietRestriction: dietRestrictionSchema
    .nullable()
    .openapi({ description: "Dietary restriction and allergen information" }),
  nutritionInfo: nutritionInfoSchema
    .nullable()
    .openapi({ description: "Nutritional information per serving" }),
});

export const diningEventsResponseSchema = z.array(eventSchema);
export const diningDatesResponseSchema = z.object({
  // earliest and latest are nullable since the diningMenu table will be empty for non-available dates
  earliest: z.string().nullable().openapi({
    description: "Earliest date with available menu data, or null if no such menus exist",
    example: "2026-01-01",
  }),
  latest: z.string().nullable().openapi({
    description: "Latest date with available menu data, or null if no such menus exist",
    example: "2026-01-31",
  }),
});
