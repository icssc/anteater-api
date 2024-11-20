import { defaultHook } from "$hooks";
import { errorSchema, responseSchema, weekQuerySchema, weekSchema } from "$schema";
import { WeekService } from "$services";
import { OpenAPIHono, createRoute } from "@hono/zod-openapi";
import { database } from "@packages/db";

const weekRouter = new OpenAPIHono<{ Bindings: Env }>({ defaultHook });

const weekRoute = createRoute({
  summary: "Retrieve current week",
  operationId: "week",
  tags: ["Calendar"],
  method: "get",
  path: "/",
  request: { query: weekQuerySchema },
  description: "Retrieves week data for the provided date, or today if one is not provided.",
  responses: {
    200: {
      content: { "application/json": { schema: responseSchema(weekSchema) } },
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

weekRouter.openapi(weekRoute, async (c) => {
  const query = c.req.valid("query");
  const service = new WeekService(database(c.env.DB.connectionString));
  const res = await service.getWeekData(query);
  return res
    ? c.json({ ok: true, data: weekSchema.parse(res) }, 200)
    : c.json(
        {
          ok: false,
          message: "Something unexpected happened. Please try again later",
        },
        500,
      );
});

export { weekRouter };
