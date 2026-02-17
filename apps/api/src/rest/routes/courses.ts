import { defaultHook } from "$hooks";
import { productionCache } from "$middleware";
import {
  batchCoursesQuerySchema,
  courseSchema,
  coursesByCursorQuerySchema,
  coursesPathSchema,
  coursesQuerySchema,
  prerequisiteSchema,
  prerequisiteTreeSchema,
  response200,
  response404,
  response422,
  response500,
} from "$schema";
import { CoursesService } from "$services";
import { OpenAPIHono, createRoute } from "@hono/zod-openapi";
import { database } from "@packages/db";

const coursesRouter = new OpenAPIHono<{ Bindings: Env }>({ defaultHook });
const coursesCursorRouter = new OpenAPIHono<{ Bindings: Env }>({ defaultHook });

coursesRouter.openAPIRegistry.register("prereq", prerequisiteSchema);
coursesRouter.openAPIRegistry.register("prereqTree", prerequisiteTreeSchema);

const batchCoursesRoute = createRoute({
  summary: "Retrieve courses with IDs",
  operationId: "batchCourses",
  tags: ["Courses"],
  method: "get",
  path: "/batch",
  request: { query: batchCoursesQuerySchema },
  description: "Retrieves courses with the IDs provided",
  responses: {
    200: response200(courseSchema.array()),
    422: response422(),
    500: response500(),
  },
});

const courseByIdRoute = createRoute({
  summary: "Retrieve a course",
  operationId: "courseById",
  tags: ["Courses"],
  method: "get",
  path: "/{id}",
  request: { params: coursesPathSchema },
  description: "Retrieves a course by its ID.",
  responses: {
    200: response200(courseSchema),
    404: response404("Course not found"),
    422: response422(),
    500: response500(),
  },
});

const coursesByFiltersRoute = createRoute({
  summary: "Filter courses",
  operationId: "coursesByFilters",
  tags: ["Courses"],
  method: "get",
  path: "/",
  request: { query: coursesQuerySchema },
  description: "Retrieves courses matching the given filters.",
  responses: {
    200: response200(courseSchema.array()),
    422: response422(),
    500: response500(),
  },
});

const coursesByCursorRoute = createRoute({
  summary: "Filter courses with cursor pagination",
  operationId: "coursesByCursor",
  tags: ["Courses"],
  method: "get",
  path: "/",
  request: { query: coursesByCursorQuerySchema },
  description: "Retrieves courses matching the given filters with cursor-based pagination.",
  responses: {
    200: response200(courseSchema.array(), true),
    422: response422(),
    500: response500(),
  },
});

coursesRouter.get(
  "*",
  productionCache({ cacheName: "anteater-api", cacheControl: "max-age=86400" }),
);

coursesRouter.openapi(batchCoursesRoute, async (c) => {
  const { ids } = c.req.valid("query");
  const service = new CoursesService(database(c.env.DB.connectionString));
  return c.json(
    {
      ok: true,
      data: courseSchema.array().parse(await service.batchGetCourses(ids)),
    },
    200,
  );
});

coursesRouter.openapi(courseByIdRoute, async (c) => {
  const { id } = c.req.valid("param");
  const service = new CoursesService(database(c.env.DB.connectionString));
  const res = await service.getCourseById(id);
  return res
    ? c.json({ ok: true, data: courseSchema.parse(res) }, 200)
    : c.json({ ok: false, message: `Course ${id} not found` }, 404);
});

coursesRouter.openapi(coursesByFiltersRoute, async (c) => {
  const query = c.req.valid("query");
  const service = new CoursesService(database(c.env.DB.connectionString));
  return c.json(
    {
      ok: true,
      data: courseSchema.array().parse(await service.getCourses(query)),
    },
    200,
  );
});

coursesCursorRouter.openapi(coursesByCursorRoute, async (c) => {
  const query = c.req.valid("query");
  const service = new CoursesService(database(c.env.DB.connectionString));

  const { items, nextCursor } = await service.getCoursesByCursor(query);
  return c.json(
    {
      ok: true,
      data: {
        items: courseSchema.array().parse(items),
        nextCursor: nextCursor,
      },
    },
    200,
  );
});

export { coursesRouter, coursesCursorRouter };
