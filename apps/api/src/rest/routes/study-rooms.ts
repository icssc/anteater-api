import { defaultHook } from "$hooks";
import { productionCache } from "$middleware";
import {
  errorSchema,
  responseSchema,
  studyRoomSchema,
  studyRoomsPathSchema,
  studyRoomsQuerySchema,
} from "$schema";
import { StudyRoomsService } from "$services";
import type { Bindings } from "$types/bindings";
import { OpenAPIHono, createRoute } from "@hono/zod-openapi";
import { database } from "@packages/db";

const studyRoomsRouter = new OpenAPIHono<{ Bindings: Bindings }>({ defaultHook });

const allStudyRoomsRoute = createRoute({
  summary: "List all study rooms",
  operationId: "allStudyRooms",
  tags: ["Study Rooms"],
  method: "get",
  path: "/all",
  description: "Retrieves all available study rooms.",
  responses: {
    200: {
      content: {
        "application/json": { schema: responseSchema(studyRoomSchema.array()) },
      },
      description: "Successful operation",
    },
    500: {
      content: { "application/json": { schema: errorSchema } },
      description: "Server error occurred",
    },
  },
});

const studyRoomByIdRoute = createRoute({
  summary: "Retrieve a study room",
  operationId: "studyRoomById",
  tags: ["Study Rooms"],
  method: "get",
  path: "/{id}",
  request: { params: studyRoomsPathSchema },
  description: "Retrieves a study room by its ID.",
  responses: {
    200: {
      content: { "application/json": { schema: responseSchema(studyRoomSchema) } },
      description: "Successful operation",
    },
    404: {
      content: { "application/json": { schema: errorSchema } },
      description: "Study room not found",
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

const studyRoomsByFiltersRoute = createRoute({
  summary: "Filter study rooms",
  operationId: "studyRoomsByFilters",
  tags: ["Study Rooms"],
  method: "get",
  path: "/",
  request: { query: studyRoomsQuerySchema },
  description: "Retrieves study rooms matching the given filters.",
  responses: {
    200: {
      content: {
        "application/json": { schema: responseSchema(studyRoomSchema.array()) },
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

studyRoomsRouter.get(
  "*",
  productionCache({ cacheName: "study-room-api", cacheControl: "max-age=86400" }),
);

studyRoomsRouter.openapi(allStudyRoomsRoute, async (c) => {
  const service = new StudyRoomsService(database(c.env.DB.connectionString));
  return c.json(
    {
      ok: true,
      data: studyRoomSchema.array().parse(await service.getAllStudyRooms()),
    },
    200,
  );
});

studyRoomsRouter.openapi(studyRoomByIdRoute, async (c) => {
  const { id } = c.req.valid("param");
  const service = new StudyRoomsService(database(c.env.DB.connectionString));
  const res = await service.getStudyRoomById(id);
  return res
    ? c.json({ ok: true, data: studyRoomSchema.parse(res) }, 200)
    : c.json({ ok: false, message: `Study room ${id} not found` }, 404);
});

studyRoomsRouter.openapi(studyRoomsByFiltersRoute, async (c) => {
  const query = c.req.valid("query");
  const service = new StudyRoomsService(database(c.env.DB.connectionString));
  return c.json(
    {
      ok: true,
      data: studyRoomSchema.array().parse(await service.getStudyRooms(query)),
    },
    200,
  );
});

export { studyRoomsRouter };
