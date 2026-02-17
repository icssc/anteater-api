import { defaultHook } from "$hooks";
import { productionCache } from "$middleware";
import {
  aggregateGradeByCourseSchema,
  aggregateGradeByOfferingSchema,
  aggregateGradesSchema,
  gradesOptionsSchema,
  gradesQuerySchema,
  rawGradeSchema,
  response200,
  response422,
  response500,
} from "$schema";
import { GradesService } from "$services";
import { OpenAPIHono, createRoute } from "@hono/zod-openapi";
import { database } from "@packages/db";

const gradesRouter = new OpenAPIHono<{ Bindings: Env }>({ defaultHook });

const rawGradesRoute = createRoute({
  summary: "Filter grades",
  operationId: "rawGrades",
  tags: ["Grades"],
  method: "get",
  path: "/raw",
  request: { query: gradesQuerySchema },
  description: "Retrieves raw grades data for the given parameters.",
  responses: {
    200: response200(rawGradeSchema.array()),
    422: response422(),
    500: response500(),
  },
});

const gradesOptionsRoute = createRoute({
  summary: "Filter grade options",
  operationId: "gradesOptions",
  tags: ["Grades"],
  method: "get",
  path: "/options",
  request: { query: gradesQuerySchema },
  description: "Retrieves a set of further possible filters for the given parameters.",
  responses: {
    200: response200(gradesOptionsSchema),
    422: response422(),
    500: response500(),
  },
});

const aggregateGradesRoute = createRoute({
  summary: "Retrieve grade aggregate",
  operationId: "aggregateGrades",
  tags: ["Grades"],
  method: "get",
  path: "/aggregate",
  request: { query: gradesQuerySchema },
  description:
    "Retrieves grades aggregated by section and the set of sections that are included in this aggregation.",
  responses: {
    200: response200(aggregateGradesSchema),
    422: response422(),
    500: response500(),
  },
});

const aggregateGradesByCourseRoute = createRoute({
  summary: "Retrieve grade aggregate by course",
  operationId: "aggregateGradesByCourse",
  tags: ["Grades"],
  method: "get",
  path: "/aggregateByCourse",
  request: { query: gradesQuerySchema },
  description:
    "Retrieves grades aggregated by course and the set of courses that are included in this aggregation.",
  responses: {
    200: response200(aggregateGradeByCourseSchema.array()),
    422: response422(),
    500: response500(),
  },
});

const aggregateGradesByOfferingRoute = createRoute({
  summary: "Retrieve grade aggregate by offering",
  operationId: "aggregateGradesByOffering",
  tags: ["Grades"],
  method: "get",
  path: "/aggregateByOffering",
  request: { query: gradesQuerySchema },
  description:
    "Retrieves grades aggregated by offering, which is a course and the instructor who taught it, and the set of courses that are included in this aggregation.",
  responses: {
    200: response200(aggregateGradeByOfferingSchema.array()),
    422: response422(),
    500: response500(),
  },
});

gradesRouter.get(
  "*",
  productionCache({ cacheName: "anteater-api", cacheControl: "max-age=86400" }),
);

gradesRouter.openapi(rawGradesRoute, async (c) => {
  const query = c.req.valid("query");
  const service = new GradesService(database(c.env.DB.connectionString));
  return c.json(
    {
      ok: true,
      data: rawGradeSchema.array().parse(await service.getRawGrades(query)),
    },
    200,
  );
});

gradesRouter.openapi(gradesOptionsRoute, async (c) => {
  const query = c.req.valid("query");
  const service = new GradesService(database(c.env.DB.connectionString));
  return c.json(
    {
      ok: true,
      data: gradesOptionsSchema.parse(await service.getGradesOptions(query)),
    },
    200,
  );
});

gradesRouter.openapi(aggregateGradesRoute, async (c) => {
  const query = c.req.valid("query");
  const service = new GradesService(database(c.env.DB.connectionString));
  return c.json(
    {
      ok: true,
      data: aggregateGradesSchema.parse(await service.getAggregateGrades(query)),
    },
    200,
  );
});

gradesRouter.openapi(aggregateGradesByCourseRoute, async (c) => {
  const query = c.req.valid("query");
  const service = new GradesService(database(c.env.DB.connectionString));
  return c.json(
    {
      ok: true,
      data: aggregateGradeByCourseSchema
        .array()
        .parse(await service.getAggregateGradesByCourse(query)),
    },
    200,
  );
});

gradesRouter.openapi(aggregateGradesByOfferingRoute, async (c) => {
  const query = c.req.valid("query");
  const service = new GradesService(database(c.env.DB.connectionString));
  return c.json(
    {
      ok: true,
      data: aggregateGradeByOfferingSchema
        .array()
        .parse(await service.getAggregateGradesByOffering(query)),
    },
    200,
  );
});

export { gradesRouter };
