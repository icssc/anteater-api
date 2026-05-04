import { createRoute, OpenAPIHono } from "@hono/zod-openapi";
import { database } from "@packages/db";
import { defaultHook } from "$hooks";
import {
  courseMaterialsQuerySchema,
  rawCourseMaterialsSchema,
  response200,
  response422,
  response500,
} from "$schema";
import { CourseMaterialsService } from "$services";

const courseMaterialsRouter = new OpenAPIHono<{ Bindings: Env }>({ defaultHook });

const rawCourseMaterialsRoute = createRoute({
  summary: "Filter course materials",
  operationId: "rawCourseMaterials",
  tags: ["Other"],
  method: "get",
  path: "/raw",
  request: { query: courseMaterialsQuerySchema },
  description: "Retrieves course materials data for the given parameters.",
  responses: {
    200: response200(rawCourseMaterialsSchema.array()),
    422: response422(),
    500: response500(),
  },
});

courseMaterialsRouter.openapi(rawCourseMaterialsRoute, async (c) => {
  const query = c.req.valid("query");
  const service = new CourseMaterialsService(database(c.env.DB.connectionString));
  return c.json(
    {
      ok: true,
      data: rawCourseMaterialsSchema.array().parse(await service.getCourseMaterials(query)),
    },
    200,
  );
});

export { courseMaterialsRouter };
