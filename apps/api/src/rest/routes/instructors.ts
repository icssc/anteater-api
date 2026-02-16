import { defaultHook } from "$hooks";
import { productionCache } from "$middleware";
import {
  batchInstructorsQuerySchema,
  cursorResponseSchema,
  instructorSchema,
  instructorsByCursorQuerySchema,
  instructorsPathSchema,
  instructorsQuerySchema,
  responseSchema,
} from "$schema";
import { InstructorsService } from "$services";
import { OpenAPIHono, createRoute } from "@hono/zod-openapi";
import { database } from "@packages/db";
import { response200, response404, response422, response500 } from "./base";

const instructorsRouter = new OpenAPIHono<{ Bindings: Env }>({
  defaultHook,
});
const instructorsCursorRouter = new OpenAPIHono<{ Bindings: Env }>({
  defaultHook,
});

const batchInstructorsRoute = createRoute({
  summary: "Retrieve instructors with UCINetIDs",
  operationId: "batchInstructors",
  tags: ["Instructors"],
  method: "get",
  path: "/batch",
  request: { query: batchInstructorsQuerySchema },
  description: "Retrieves instructors with the UCINetIDs provided.",
  responses: {
    200: response200(responseSchema(instructorSchema.array())),
    422: response422(),
    500: response500(),
  },
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
    200: response200(responseSchema(instructorSchema)),
    404: response404("Instructor not found"),
    422: response422(),
    500: response500(),
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
    200: response200(responseSchema(instructorSchema.array())),
    422: response422(),
    500: response500(),
  },
});

const instructorsByCursorRoute = createRoute({
  summary: "Filter instructors with cursor pagination",
  operationId: "instructorsByCursor",
  tags: ["Instructors"],
  method: "get",
  path: "/",
  request: { query: instructorsByCursorQuerySchema },
  description: "Retrieves instructors matching the given filters with cursor-based pagination.",
  responses: {
    200: response200(cursorResponseSchema(instructorSchema.array())),
    422: response422(),
    500: response500(),
  },
});

instructorsRouter.get(
  "*",
  productionCache({ cacheName: "anteater-api", cacheControl: "max-age=86400" }),
);

instructorsRouter.openapi(batchInstructorsRoute, async (c) => {
  const { ucinetids } = c.req.valid("query");
  const service = new InstructorsService(database(c.env.DB.connectionString));
  return c.json(
    {
      ok: true,
      data: instructorSchema.array().parse(await service.batchGetInstructors(ucinetids)),
    },
    200,
  );
});

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

instructorsCursorRouter.openapi(instructorsByCursorRoute, async (c) => {
  const query = c.req.valid("query");
  const service = new InstructorsService(database(c.env.DB.connectionString));

  const { items, nextCursor } = await service.getInstructorsByCursor(query);
  return c.json(
    {
      ok: true,
      data: {
        items: instructorSchema.array().parse(items),
        nextCursor: nextCursor,
      },
    },
    200,
  );
});

export { instructorsRouter, instructorsCursorRouter };
