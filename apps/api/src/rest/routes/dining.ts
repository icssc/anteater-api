import { defaultHook } from "$hooks";
import { productionCache } from "$middleware";
import {
  batchDishesQuerySchema,
  diningDatesResponseSchema,
  diningEventsQuerySchema,
  diningEventsResponseSchema,
  dishQuerySchema,
  dishSchema,
  errorSchema,
  responseSchema,
  restaurantTodayQuerySchema,
  restaurantTodayResponseSchema,
  restaurantsQuerySchema,
  restaurantsResponseSchema,
} from "$schema";
import { DiningService } from "$services";
import { OpenAPIHono, createRoute } from "@hono/zod-openapi";
import { database } from "@packages/db";

const diningRouter = new OpenAPIHono<{ Bindings: Env }>({ defaultHook });

diningRouter.get("*", productionCache({ cacheName: "anteater-api", cacheControl: "max-age=3600" }));

const eventsRoute = createRoute({
  summary: "Get upcoming dining events",
  operationId: "getDiningEvents",
  tags: ["Dining"],
  method: "get",
  path: "/events",
  request: { query: diningEventsQuerySchema },
  description: "Retrieves all dining events that end today or later",
  responses: {
    200: {
      content: {
        "application/json": { schema: responseSchema(diningEventsResponseSchema) },
      },
      description: "Successful operation",
    },
    422: {
      content: { "application/json": { schema: errorSchema } },
      description: "Parameters failed validation",
    },
    500: {
      content: { "application/json": { schema: errorSchema } },
      description: "Server error occurred",
    },
  },
});

const batchDishesRoute = createRoute({
  summary: "Retrieve dishes by IDs",
  operationId: "batchDishes",
  tags: ["Dining"],
  method: "get",
  path: "/dishes/batch",
  request: { query: batchDishesQuerySchema },
  description: "Retrieves courses with the IDs provided",
  responses: {
    200: {
      content: {
        "application/json": { schema: responseSchema(dishSchema.array()) },
      },
      description: "Successful operation",
    },
    422: {
      content: { "application/json": { schema: errorSchema } },
      description: "Parameters failed validation",
    },
    500: {
      content: { "application/json": { schema: errorSchema } },
      description: "Server error occurred",
    },
  },
});

const dishRoute = createRoute({
  summary: "Get a dish by ID",
  operationId: "getDiningDish",
  tags: ["Dining"],
  method: "get",
  path: "/dishes/{id}",
  request: { params: dishQuerySchema },
  description: "Retrieves a single dish with nutrition and dietary restriction information",
  responses: {
    200: {
      content: {
        "application/json": { schema: responseSchema(dishSchema) },
      },
      description: "Successful operation",
    },
    404: {
      content: { "application/json": { schema: errorSchema } },
      description: "Dish not found",
    },
    422: {
      content: { "application/json": { schema: errorSchema } },
      description: "Parameters failed validation",
    },
    500: {
      content: { "application/json": { schema: errorSchema } },
      description: "Server error occurred",
    },
  },
});

const datesRoute = createRoute({
  summary: "Get date range for available dining data",
  operationId: "getDiningDates",
  tags: ["Dining"],
  method: "get",
  path: "/dates",
  description: "Retrieves the earliest and latest dates that have menu information available",
  responses: {
    200: {
      content: {
        "application/json": { schema: responseSchema(diningDatesResponseSchema) },
      },
      description: "Successful operation",
    },
    404: {
      content: { "application/json": { schema: errorSchema } },
      description: "Dish not found",
    },
    422: {
      content: { "application/json": { schema: errorSchema } },
      description: "Parameters failed validation",
    },
    500: {
      content: { "application/json": { schema: errorSchema } },
      description: "Server error occurred",
    },
  },
});

const restaurantsRoute = createRoute({
  summary: "Get restaurants",
  operationId: "getDiningRestaurants",
  tags: ["Dining"],
  method: "get",
  path: "/restaurants",
  request: { query: restaurantsQuerySchema },
  description:
    "Retrieve restaurants and associated stations. These are expected to change very infrequently, if at all.",
  responses: {
    200: {
      content: {
        "application/json": { schema: responseSchema(restaurantsResponseSchema) },
      },
      description: "Successful operation",
    },
    404: {
      content: { "application/json": { schema: errorSchema } },
      description: "Restaurant not found",
    },
    422: {
      content: { "application/json": { schema: errorSchema } },
      description: "Parameters failed validation",
    },
    500: {
      content: { "application/json": { schema: errorSchema } },
      description: "Server error occurred",
    },
  },
});

const restaurantTodayRoute = createRoute({
  summary: "Get state for restaurant on day",
  operationId: "getDiningRestaurantToday",
  tags: ["Dining"],
  method: "get",
  path: "/restaurantToday",
  request: { query: restaurantTodayQuerySchema },
  description:
    "Retrieve state for one restaurant on one day, e.g. menus and dishes. These will vary between days.",
  responses: {
    200: {
      content: {
        "application/json": { schema: responseSchema(restaurantTodayResponseSchema) },
      },
      description: "Successful operation",
    },
    404: {
      content: { "application/json": { schema: errorSchema } },
      description: "Restaurant not found",
    },
    422: {
      content: { "application/json": { schema: errorSchema } },
      description: "Parameters failed validation",
    },
    500: {
      content: { "application/json": { schema: errorSchema } },
      description: "Server error occurred",
    },
  },
});

diningRouter.openapi(eventsRoute, async (c) => {
  const query = c.req.valid("query");
  const service = new DiningService(database(c.env.DB.connectionString));
  const events = await service.getUpcomingEvents(query);

  return c.json({ ok: true, data: diningEventsResponseSchema.parse(events) }, 200);
});

diningRouter.openapi(batchDishesRoute, async (c) => {
  const { ids } = c.req.valid("query");
  const service = new DiningService(database(c.env.DB.connectionString));
  return c.json(
    {
      ok: true,
      data: dishSchema.array().parse(await service.batchGetDishes(ids)),
    },
    200,
  );
});

diningRouter.openapi(dishRoute, async (c) => {
  const { id } = c.req.valid("param");
  const service = new DiningService(database(c.env.DB.connectionString));
  const dish = await service.getDishById({ id });

  if (!dish) {
    return c.json({ ok: false, message: "Dish not found" }, 404);
  }

  return c.json({ ok: true, data: dishSchema.parse(dish) }, 200);
});

diningRouter.openapi(datesRoute, async (c) => {
  const service = new DiningService(database(c.env.DB.connectionString));
  const dates = await service.getPickableDates();

  return c.json({ ok: true, data: diningDatesResponseSchema.parse(dates) }, 200);
});

diningRouter.openapi(restaurantsRoute, async (c) => {
  const query = c.req.valid("query");
  const service = new DiningService(database(c.env.DB.connectionString));

  const data = restaurantsResponseSchema.parse(await service.getRestaurants(query));
  if (!data.length && query.id !== undefined) {
    return c.json({ ok: false, message: "Restaurant not found" }, 404);
  }
  return c.json({ ok: true, data: data }, 200);
});

diningRouter.openapi(restaurantTodayRoute, async (c) => {
  const query = c.req.valid("query");
  const service = new DiningService(database(c.env.DB.connectionString));

  const data = restaurantTodayResponseSchema.parse(await service.getRestaurantToday(query));
  if (!data) {
    return c.json({ ok: false, message: "Restaurant not found" }, 404);
  }
  return c.json({ ok: true, data: data }, 200);
});

export { diningRouter };
