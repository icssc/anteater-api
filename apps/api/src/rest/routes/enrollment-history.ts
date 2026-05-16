import { createRoute, OpenAPIHono } from "@hono/zod-openapi";
import { database } from "@packages/db";
import { defaultHook } from "$hooks";
import { productionCache } from "$middleware";
import {
  enrollmentHistoryGranularQuerySchema,
  enrollmentHistoryGranularSchema,
  enrollmentHistoryQuerySchema,
  enrollmentHistorySchema,
  response200,
  response422,
  response500,
} from "$schema";
import { EnrollmentHistoryService } from "$services";

const enrollmentHistoryRouter = new OpenAPIHono<{ Bindings: Env }>({
  defaultHook,
});

const enrollmentHistoryRoute = createRoute({
  summary: "Filter enrollment history",
  operationId: "enrollmentHistory",
  tags: ["Enrollment History"],
  method: "get",
  path: "/",
  request: { query: enrollmentHistoryQuerySchema },
  description:
    "Retrieves historical enrollment data for the given parameters. Granular history arrays only available for recent terms.",
  responses: {
    200: response200(enrollmentHistorySchema.array()),
    422: response422(),
    500: response500(),
  },
});

const enrollmentHistoryGranularRoute = createRoute({
  summary: "Filter granular enrollment history",
  operationId: "enrollmentHistoryGranular",
  tags: ["Enrollment History"],
  method: "get",
  path: "/granular",
  request: { query: enrollmentHistoryGranularQuerySchema },
  description:
    "Retrieves high-resolution enrollment history with full timestamps for the given parameters. Use from/to to scope the response to a specific time window.",
  responses: {
    200: response200(enrollmentHistoryGranularSchema.array()),
    422: response422(),
    500: response500(),
  },
});

enrollmentHistoryRouter.get(
  "*",
  productionCache({ cacheName: "anteater-api", cacheControl: "max-age=300" }),
);

enrollmentHistoryRouter.openapi(enrollmentHistoryRoute, async (c) => {
  const query = c.req.valid("query");
  const service = new EnrollmentHistoryService(database(c.env.DB.connectionString));
  return c.json(
    {
      ok: true,
      data: enrollmentHistorySchema.array().parse(await service.getEnrollmentHistory(query)),
    },
    200,
  );
});

enrollmentHistoryRouter.openapi(enrollmentHistoryGranularRoute, async (c) => {
  const query = c.req.valid("query");
  const service = new EnrollmentHistoryService(database(c.env.DB.connectionString));
  return c.json(
    {
      ok: true,
      data: enrollmentHistoryGranularSchema
        .array()
        .parse(await service.getEnrollmentHistoryGranular(query)),
    },
    200,
  );
});

export { enrollmentHistoryRouter };
