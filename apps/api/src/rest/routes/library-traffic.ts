import { createRoute, OpenAPIHono } from "@hono/zod-openapi";
import { database } from "@packages/db";
import { defaultHook } from "$hooks";
import { productionCache } from "$middleware";
import {
  libraryTrafficHistoryAggregatedQuerySchema,
  libraryTrafficHistoryAggregatedSchema,
  libraryTrafficHistoryPatternQuerySchema,
  libraryTrafficHistoryPatternSchema,
  libraryTrafficHistoryRawQuerySchema,
  libraryTrafficHistoryRawSchema,
  libraryTrafficQuerySchema,
  libraryTrafficSchema,
  response200,
  response404,
  response422,
  response500,
} from "$schema";
import { LibraryTrafficService } from "$services";

const libraryTrafficRouter = new OpenAPIHono<{ Bindings: Env }>({ defaultHook });

libraryTrafficRouter.get(
  "*",
  productionCache({ cacheName: "anteater-api", cacheControl: "max-age=1800" }),
);

const libraryTrafficRoute = createRoute({
  summary: "Retrieve latest library traffic data",
  operationId: "libraryTraffic",
  tags: ["Library Traffic"],
  method: "get",
  path: "/",
  request: { query: libraryTrafficQuerySchema },
  description: "Retrieves latest library occupancy metrics for specific locations",
  responses: {
    200: response200(libraryTrafficSchema),
    400: response404("No matching data found for provided parameters"),
    422: response422(),
    500: response500(),
  },
});

libraryTrafficRouter.openapi(libraryTrafficRoute, async (c) => {
  const query = c.req.valid("query");
  const service = new LibraryTrafficService(database(c.env.DB.connectionString));
  const res = await service.getLibraryTraffic(query);

  if (res.length === 0) {
    return c.json(
      { ok: false, message: "Library traffic data not found: check for typos in query" },
      400,
    );
  }

  return c.json({ ok: true, data: libraryTrafficSchema.parse(res) }, 200);
});

const libraryTrafficHistoryRawRoute = createRoute({
  summary: "Retrieve raw historical library traffic data",
  operationId: "libraryTrafficHistory",
  tags: ["Library Traffic"],
  method: "get",
  path: "/history",
  request: { query: libraryTrafficHistoryRawQuerySchema },
  description:
    "Retrieves paginated raw occupancy records. Filter by location and date range or academic term (year + quarter + period).",
  responses: {
    200: response200(libraryTrafficHistoryRawSchema, { isCursor: true }),
    422: response422(),
    500: response500(),
  },
});

libraryTrafficRouter.openapi(libraryTrafficHistoryRawRoute, async (c) => {
  const query = c.req.valid("query");
  const service = new LibraryTrafficService(database(c.env.DB.connectionString));
  const { items, nextCursor } = await service.getLibraryTrafficHistoryRaw(query);
  return c.json(
    {
      ok: true,
      data: {
        items: libraryTrafficHistoryRawSchema.parse(items),
        nextCursor,
      },
    },
    200,
  );
});

const libraryTrafficHistoryAggregatedRoute = createRoute({
  summary: "Retrieve aggregated historical library traffic data",
  operationId: "libraryTrafficHistoryAggregated",
  tags: ["Library Traffic"],
  method: "get",
  path: "/history/aggregated",
  request: { query: libraryTrafficHistoryAggregatedQuerySchema },
  description:
    "Retrieves time-averaged occupancy metrics grouped by granularity. Scope with either (startDate + endDate) or (year + quarter). Max range: 14 days (hour), 365 days (day), 730 days (week/month).",
  responses: {
    200: response200(libraryTrafficHistoryAggregatedSchema),
    422: response422(),
    500: response500(),
  },
});

libraryTrafficRouter.openapi(libraryTrafficHistoryAggregatedRoute, async (c) => {
  const query = c.req.valid("query");
  const service = new LibraryTrafficService(database(c.env.DB.connectionString));
  const res = await service.getLibraryTrafficHistoryAggregated(query);
  return c.json({ ok: true, data: libraryTrafficHistoryAggregatedSchema.parse(res) }, 200);
});

const libraryTrafficHistoryPatternRoute = createRoute({
  summary: "Retrieve pattern-averaged library traffic data",
  operationId: "libraryTrafficHistoryPattern",
  tags: ["Library Traffic"],
  method: "get",
  path: "/history/pattern",
  request: { query: libraryTrafficHistoryPatternQuerySchema },
  description:
    "Retrieves typical occupancy averaged across recurring time slots (e.g. all Mondays, all 2pm hours). Granularity controls the cycle: hour → 24 buckets (0-23), day → 7 (1=Mon...7=Sun), week → 10 buckets (week-of-term), month → 12.",
  responses: {
    200: response200(libraryTrafficHistoryPatternSchema),
    422: response422(),
    500: response500(),
  },
});

libraryTrafficRouter.openapi(libraryTrafficHistoryPatternRoute, async (c) => {
  const query = c.req.valid("query");
  const service = new LibraryTrafficService(database(c.env.DB.connectionString));
  const res = await service.getLibraryTrafficHistoryPattern(query);
  return c.json({ ok: true, data: libraryTrafficHistoryPatternSchema.parse(res) }, 200);
});

export { libraryTrafficRouter };
