import { defaultHook } from "$hooks";
import { responseSchema, weekQuerySchema, weekSchema } from "$schema";
import { WeekService } from "$services";
import { OpenAPIHono, createRoute } from "@hono/zod-openapi";
import { database } from "@packages/db";
import { response200, response422, response500 } from "./base";

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
    200: response200(responseSchema(weekSchema)),
    422: response422(),
    500: response500(),
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
