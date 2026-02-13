import { z } from "@hono/zod-openapi";

export const restaurantIdSchema = z.string().openapi({
  example: "anteatery",
});

export const diningEventsQuerySchema = z.object({
  restaurantId: restaurantIdSchema.optional().openapi({
    description: "Filter events by restaurant ID",
  }),
});

export const diningDishQuerySchema = z.object({
  id: z.string().openapi({
    example: "1923_101628_M35424_1_13208",
    description: "Unique dish identifier from dining system",
  }),
});

export const diningPeterplateQuerySchema = z.object({
  date: z.coerce.date().openapi({
    example: "2026-01-28",
  }),
});

export const eventSchema = z.object({
  title: z.string().openapi({ example: "Lunar New Year Celebration" }),
  image: z.string().nullable().openapi({ description: "URL to event promotional image" }),
  restaurantId: restaurantIdSchema.openapi({
    description: "Unique identifier for the restaurant hosting this event",
  }),
  longDescription: z.string().nullable().openapi({
    example:
      "New year, new vibes. Kick off the celebration with bold Szechuan beef steak, chicken teriyaki dumplings, spicy vegetable lo mein, and more!",
    description: "Description of the event",
  }),
  // transforms Date objects in db to ISO 8601 strings (I hope)
  start: z.coerce.date().transform((d) => d?.toISOString()),
  end: z.coerce
    .date()
    .nullable()
    .transform((d) => d?.toISOString() ?? null),
  updatedAt: z.coerce.date().transform((d) => d.toISOString()),
});

export const dietRestrictionSchema = z.object({
  // omit redundant foreign key in output
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
  // omit redundant foreign key in output
  servingSize: z.string().nullable(),
  servingUnit: z.string().nullable(),
  calories: z.coerce.number().nullable(),
  totalFatG: z.coerce.number().nullable(),
  transFatG: z.coerce.number().nullable(),
  saturatedFatG: z.coerce.number().nullable(),
  cholesterolMg: z.coerce.number().nullable(),
  sodiumMg: z.coerce.number().nullable(),
  totalCarbsG: z.coerce.number().nullable(),
  dietaryFiberG: z.coerce.number().nullable(),
  sugarsG: z.coerce.number().nullable(),
  proteinG: z.coerce.number().nullable(),
  calciumMg: z.coerce.number().nullable(),
  ironMg: z.coerce.number().nullable(),
  vitaminAIU: z.coerce.number().nullable(),
  vitaminCIU: z.coerce.number().nullable(),
  // the updatedAt value is somewhat redundant, as it should be almost identical to the field of its dish
});

export const dishSchema = z.object({
  id: z.string().openapi({
    example: "1923_101628_M35424_1_13208",
    description: "Unique dish identifier",
  }),
  stationId: z.string().openapi({
    example: "1935",
    description: "ID of the station serving this dish",
  }),
  name: z.string().openapi({
    example: "Grilled Chicken Breast",
    description: "Name of the dish",
  }),
  description: z.string().openapi({
    example: "Seasoned and grilled chicken",
    description: "Description of the dish",
  }),
  ingredients: z.string().nullable().openapi({ example: "Chicken, salt, pepper" }),
  category: z.string().openapi({
    example: "Saute",
    description: "Category of the dish",
  }),
  imageUrl: z.string().nullable().openapi({
    description: "A URL to an image of this dish",
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

export const restaurantsQuerySchema = z.object({
  id: z.string().optional().openapi({
    description: "If present, only return the restaurant with this ID (if it exists)",
  }),
});

export const stationSchema = z.object({
  id: z.string(),
  name: z.string().openapi({
    example: "The Crossroads",
  }),
  restaurantId: restaurantIdSchema,
  updatedAt: z.date(),
});

export const restaurantSchema = z.object({ id: restaurantIdSchema, updatedAt: z.date() });

export const restaurantsResponseSchema = restaurantSchema
  .extend({
    stations: stationSchema.omit({ restaurantId: true }).array(),
  })
  .array();
