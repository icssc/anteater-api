import { defaultHook } from "$hooks";
import {
  responseSchema,
  studyRoomSchema,
  studyRoomsPathSchema,
  studyRoomsQuerySchema,
} from "$schema";
import { StudyRoomsService } from "$services";
import { OpenAPIHono, createRoute } from "@hono/zod-openapi";
import { database } from "@packages/db";
import { response200, response404, response422, response500 } from "./base";

const studyRoomsRouter = new OpenAPIHono<{ Bindings: Env }>({ defaultHook });

const studyRoomByIdRoute = createRoute({
  summary: "Retrieve a study room",
  operationId: "studyRoomById",
  tags: ["Study Rooms"],
  method: "get",
  path: "/{id}",
  request: { params: studyRoomsPathSchema },
  description: "Retrieves a study room by its ID.",
  responses: {
    200: response200(responseSchema(studyRoomSchema)),
    404: response404("Study room not found"),
    422: response422(),
    500: response500(),
  },
});

const studyRoomsByFiltersRoute = createRoute({
  summary: "Retrieve study rooms",
  operationId: "studyRoomsByFilters",
  tags: ["Study Rooms"],
  method: "get",
  path: "/",
  request: { query: studyRoomsQuerySchema },
  description:
    "Retrieves study rooms matching the given filters. If no filters are provided, all rooms are returned.",
  responses: {
    200: response200(responseSchema(studyRoomSchema.array())),
    500: response500(),
  },
});

// studyRoomsRouter.get("*");

studyRoomsRouter.openapi(studyRoomByIdRoute, async (c) => {
  const { id } = c.req.valid("param");
  const service = new StudyRoomsService(database(c.env.DB.connectionString));
  const res = await service.getStudyRoomById(id);
  return res
    ? c.json({ ok: true, data: studyRoomSchema.parse(res) }, 200)
    : c.json({ ok: false, message: `Study room ${id} not found` }, 404);
});

studyRoomsRouter.openapi(studyRoomsByFiltersRoute, async (c) => {
  const query = c.req.valid("query") || {}; // no filters required
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
