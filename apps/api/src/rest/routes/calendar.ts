import { defaultHook } from "$hooks";
import { productionCache } from "$middleware";
import {
  calendarQuerySchema,
  calendarTermSchema,
  response200,
  response404,
  response422,
  response500,
} from "$schema";
import { CalendarService } from "$services";
import { OpenAPIHono, createRoute } from "@hono/zod-openapi";
import { database } from "@packages/db";

const calendarRouter = new OpenAPIHono<{ Bindings: Env }>({ defaultHook });

const calendarTermRoute = createRoute({
  summary: "Retrieve term calendar",
  operationId: "calendarTerm",
  tags: ["Calendar"],
  method: "get",
  path: "/",
  request: { query: calendarQuerySchema },
  description: "Retrieves key dates for the provided term.",
  responses: {
    200: response200(calendarTermSchema),
    404: response404("Term not found"),
    422: response422(),
    500: response500(),
  },
});

const allCalendarTermsRoute = createRoute({
  summary: "List all calendars",
  operationId: "allCalendarTerms",
  tags: ["Calendar"],
  method: "get",
  path: "/all",
  description: "Retrieves all data for all terms that are currently available.",
  responses: {
    200: response200(calendarTermSchema.array()),
    500: response500(),
  },
});

calendarRouter.get(
  "*",
  productionCache({ cacheName: "anteater-api", cacheControl: "max-age=86400" }),
);

calendarRouter.openapi(calendarTermRoute, async (c) => {
  const query = c.req.valid("query");
  const service = new CalendarService(database(c.env.DB.connectionString));
  const res = await service.getCalendarTerm(query);
  return res
    ? c.json({ ok: true, data: calendarTermSchema.parse(res) }, 200)
    : c.json(
        {
          ok: false,
          message: `Term ${query.year} ${query.quarter} not found`,
        },
        404,
      );
});

calendarRouter.openapi(allCalendarTermsRoute, async (c) => {
  const service = new CalendarService(database(c.env.DB.connectionString));
  return c.json(
    {
      ok: true,
      data: calendarTermSchema.array().parse(await service.getAllCalendarTerms()),
    },
    200,
  );
});

export { calendarRouter };
