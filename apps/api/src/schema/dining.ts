import { z } from "@hono/zod-openapi";

export const restaurantIdSchema = z
  .enum(["anteatery", "brandywine"])
  .openapi({ example: "anteatery" });

export const diningEventsQuerySchema = z.object({
  restaurantId: restaurantIdSchema.optional().openapi({
    description: "Filter events by restaurant ID",
  }),
});

export const batchDishesQuerySchema = z.object({
  ids: z
    .string({ error: "Parameter 'ids' is required" })
    .transform((xs) => xs.split(","))
    .openapi({ example: "1923_101628_M34418_1_30296,1923_101628_M10094_1_19163" }),
});

export const dishQuerySchema = z.object({
  id: z.string().openapi({
    example: "1821_122168_M40780_1_25617",
    description: "Unique dish identifier from dining system",
  }),
});

export const eventSchema = z.object({
  title: z.string().openapi({ example: "Lunar New Year Celebration" }),
  image: z.string().nullable().openapi({ description: "URL to event promotional image" }),
  restaurantId: restaurantIdSchema.openapi({
    description: "Unique identifier for the restaurant hosting this event",
  }),
  description: z.string().nullable().openapi({
    example:
      "New year, new vibes. Kick off the celebration with bold Szechuan beef steak, chicken teriyaki dumplings, spicy vegetable lo mein, and more!",
    description: "Description of the event",
  }),
  start: z.coerce.date().openapi({
    description: "Start date of event",
    example: "2026-02-18 19:00:00.000000",
  }),
  end: z.coerce.date().nullable().openapi({
    description: "End date of event. Events with no end date are often one-day events.",
  }),
  updatedAt: z.coerce.date(),
});

export const dietRestrictionSchema = z.object({
  // omit redundant foreign key in output
  containsEggs: z.boolean(),
  containsFish: z.boolean(),
  containsMilk: z.boolean(),
  containsPeanuts: z.boolean(),
  containsSesame: z.boolean(),
  containsShellfish: z.boolean(),
  containsSoy: z.boolean(),
  containsTreeNuts: z.boolean(),
  containsWheat: z.boolean(),
  isGlutenFree: z.boolean(),
  isHalal: z.boolean(),
  isKosher: z.boolean(),
  isLocallyGrown: z.boolean(),
  isOrganic: z.boolean(),
  isVegan: z.boolean(),
  isVegetarian: z.boolean(),
  // updatedAt
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
  // updatedAt
});

export const dishSchema = z.object({
  id: z.string().openapi({
    example: "1821_122168_M40780_1_25617",
    description: "Unique dish identifier",
  }),
  stationId: z.string().openapi({
    example: "1887",
    description: "ID of the station serving this dish",
  }),
  name: z.string().openapi({
    example: "Grilled Indian-Spiced Chicken",
    description: "Name of the dish",
  }),
  description: z.string().openapi({
    example:
      "Juicy chicken breast seasoned with a flavorful blend of toasted cumin, cinnamon and turmeric",
    description: "Description of the dish",
  }),
  ingredients: z
    .string()
    .nullable()
    .openapi({ example: "Chicken Breast, Canola Oil, Turmeric, Cinnamon, Cumin" }),
  category: z.string().openapi({
    example: "Grilled",
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
  // earliest and latest are nullable since the diningMenu table can be empty
  earliest: z.string().nullable().openapi({
    description: "Earliest date with available menu data, or null if no data",
    example: "2026-01-01",
  }),
  latest: z.string().nullable().openapi({
    description: "Latest date with available menu data, or null if no data",
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
    example: "2026-02-20",
  }),
});

export const restaurantTodayResponseSchema = restaurantSchema.extend({
  periods: z.record(
    z.string().openapi({ description: "The ID of a period." }),
    z.object({
      name: z.string().openapi({ description: "The name of a period", example: "Lunch" }),
      startTime: z.iso.time(),
      endTime: z.iso.time(),
      stationToDishes: z.record(
        z.string().openapi({ description: "The ID of a station." }),
        z.string().array().openapi({
          description: "The ID(s) of the dish(es) served at this station in this period.",
        }),
      ),
      updatedAt: z.date(),
    }),
  ),
});
