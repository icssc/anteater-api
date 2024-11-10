import { defaultHook } from "$hooks";
import { productionCache } from "$middleware";
import {
  errorSchema,
  instructorSchema,
  instructorsPathSchema,
  instructorsQuerySchema,
  responseSchema,
} from "$schema";
import { InstructorsService } from "$services";
import type { Bindings } from "$types/bindings";
import { OpenAPIHono, createRoute } from "@hono/zod-openapi";
import { database } from "@packages/db";

const instructorsRouter = new OpenAPIHono<{ Bindings: Bindings }>({
  defaultHook,
});

const instructorByIdRoute = createRoute({
  summary: "Retrieve a instructor",
  operationId: "instructorById",
  tags: ["Instructors"],
  method: "get",
  path: "/{ucinetid}",
  request: { params: instructorsPathSchema },
  description: "Retrieves an instructor by their UCInetID.",
  responses: {
    200: {
      content: {
        "application/json": { schema: responseSchema(instructorSchema) },
      },
      description: "Successful operation",
    },
    404: {
      content: { "application/json": { schema: errorSchema } },
      description: "Instructor not found",
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

const instructorsByFiltersRoute = createRoute({
  summary: "Filter instructors",
  operationId: "instructorsByFilters",
  tags: ["Instructors"],
  method: "get",
  path: "/",
  request: { query: instructorsQuerySchema },
  description: "Retrieves instructors matching the given filters.",
  responses: {
    200: {
      content: {
        "application/json": {
          schema: responseSchema(instructorSchema.array()),
        },
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

instructorsRouter.get(
  "*",
  productionCache({ cacheName: "anteater-api", cacheControl: "max-age=86400" }),
);

instructorsRouter.openapi(instructorByIdRoute, async (c) => {
  const { ucinetid } = c.req.valid("param");
  const service = new InstructorsService(database(c.env.DB.connectionString));
  const res = await service.getInstructorByUCInetID(ucinetid);
  return res
    ? c.json({ ok: true, data: instructorSchema.parse(res) }, 200)
    : c.json({ ok: false, message: `Instructor ${ucinetid} not found` }, 404);
});

instructorsRouter.openapi(instructorsByFiltersRoute, async (c) => {
  const query = c.req.valid("query");
  const service = new InstructorsService(database(c.env.DB.connectionString));
  return c.json(
    {
      ok: true,
      data: instructorSchema.array().parse(await service.getInstructors(query)),
    },
    200,
  );
});

export { instructorsRouter };
