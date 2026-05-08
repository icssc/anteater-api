import { createRoute, OpenAPIHono } from "@hono/zod-openapi";
import { database } from "@packages/db";
import { defaultHook } from "$hooks";
import { productionCache } from "$middleware";
import {
  courseMaterialsQuerySchema,
  courseMaterialsSchema,
  response200,
  response422,
  response500,
} from "$schema";
import { CourseMaterialsService } from "$services";

const courseMaterialsRouter = new OpenAPIHono<{ Bindings: Env }>({ defaultHook });

const filterCourseMaterialsRoute = createRoute({
  summary: "Filter course materials",
  operationId: "filterCourseMaterials",
  tags: ["Course Materials"],
  method: "get",
  path: "/",
  request: { query: courseMaterialsQuerySchema },
  description: "Retrieves course materials data for the given parameters.",
  responses: {
    200: response200(courseMaterialsSchema.array()),
    422: response422(),
    500: response500(),
  },
});

courseMaterialsRouter.get(
  "*",
  productionCache({ cacheName: "anteater-api", cacheControl: "max-age=86400" }),
);

courseMaterialsRouter.openapi(filterCourseMaterialsRoute, async (c) => {
  const query = c.req.valid("query");
  const service = new CourseMaterialsService(database(c.env.DB.connectionString));
  return c.json(
    {
      ok: true,
      data: courseMaterialsSchema.array().parse(await service.getCourseMaterials(query)),
    },
    200,
  );
});

export { courseMaterialsRouter };
