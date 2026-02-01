import { defaultHook } from "$hooks";
import {
  diningDishQuerySchema,
  diningEventQuerySchema,
  diningEventsResponseSchema,
  dishSchema,
  errorSchema,
  responseSchema,
} from "$schema";
import { DiningService } from "$services";
import { OpenAPIHono, createRoute } from "@hono/zod-openapi";
import { database } from "@packages/db";

const diningRouter = new OpenAPIHono<{ Bindings: Env }>({ defaultHook });

const eventsRoute = createRoute({
  summary: "Get upcoming dining events",
  operationId: "getDiningEvents",
  tags: ["Dining"],
  method: "get",
  path: "/events",
  request: { query: diningEventQuerySchema },
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

diningRouter.openapi(eventsRoute, async (c) => {
  const query = c.req.valid("query");
  const service = new DiningService(database(c.env.DB.connectionString));
  const events = await service.getUpcomingEvents(query);

  return c.json({ ok: true, data: diningEventsResponseSchema.parse(events) }, 200);
});

const dishRoute = createRoute({
  summary: "Get a dish by ID",
  operationId: "getDiningDish",
  tags: ["Dining"],
  method: "get",
  path: "/dishes/{id}",
  request: { params: diningDishQuerySchema },
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

diningRouter.openapi(dishRoute, async (c) => {
  const { id } = c.req.valid("param");
  const service = new DiningService(database(c.env.DB.connectionString));
  const dish = await service.getDishById({ id });

  if (!dish) {
    return c.json({ ok: false, message: "Dish not found" }, 404);
  }

  return c.json({ ok: true, data: dishSchema.parse(dish) }, 200);
});

export { diningRouter };
