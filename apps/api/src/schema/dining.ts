import { z } from "@hono/zod-openapi";

export const restaurantIdSchema = z.enum(["anteatery", "brandywine"]);

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
  start: z.coerce.date(),
  end: z.coerce.date().nullable(),
  updatedAt: z.coerce.date(),
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
  updatedAt: z.coerce.date(),
  // almost always present
  dietRestriction: dietRestrictionSchema
    .nullable()
    .openapi({ description: "Dietary restriction and allergen information" }),
  // almost always present
  nutritionInfo: nutritionInfoSchema
    .nullable()
    .openapi({ description: "Nutritional information per serving" }),
});

export const diningEventsResponseSchema = z.array(eventSchema);

export const diningDatesResponseSchema = z.object({
  // earliest and latest are nullable since the diningMenu table will be empty for non-available dates
  earliest: z.string().nullable().openapi({
    description: "Earliest date with available menu data, or null if no menus exist",
    example: "2026-01-01",
  }),
  latest: z.string().nullable().openapi({
    description: "Latest date with available menu data, or null if no menus exist",
    example: "2026-01-31",
  }),
});

export const restaurantsQuerySchema = z.object({
  id: restaurantIdSchema.optional().openapi({
    description: "If present, only return the restaurant with this ID (if it exists)",
  }),
});

export const stationSchema = z.object({
  id: z.string(),
  name: z.string().openapi({
    example: "Grubb",
  }),
  restaurantId: restaurantIdSchema,
  updatedAt: z.date(),
});

export const restaurantSchema = z.object({
  id: restaurantIdSchema,
  updatedAt: z.date(),
});

export const restaurantsResponseSchema = restaurantSchema
  .extend({
    stations: stationSchema.omit({ restaurantId: true }).array(),
  })
  .array();

export const restaurantTodayQuerySchema = z.object({
  id: restaurantIdSchema.openapi({
    description: "Get information on the restaurant with this ID",
  }),
  date: z.iso.date().openapi({
    description: "Get information for this day, in the UCI timezone",
  }),
});

export const restaurantTodayResponseSchema = restaurantSchema.extend({
  periods: z.record(
    z.string().openapi({ description: "The ID of a period." }),
    z.object({
      startTime: z.iso.time(),
      endTime: z.iso.time(),
      stations: z.record(
        z.string().openapi({ description: "The ID of a station." }),
        z.object({
          name: z.string().openapi({ description: "The name of the station being described." }),
          dishes: z.string().array().openapi({
            description: "The ID(s) of the dish(es) served at this station in this period.",
          }),
        }),
      ),
      updatedAt: z.date(),
    }),
  ),
});
