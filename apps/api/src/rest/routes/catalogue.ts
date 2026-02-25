import { defaultHook } from "$hooks";
import { productionCache } from "$middleware";
import {
  response200,
  response404,
  response500,
  sampleProgramsQuerySchema,
  sampleProgramsResponseSchema,
} from "$schema";
import { ProgramsService } from "$services";
import { OpenAPIHono, createRoute } from "@hono/zod-openapi";
import { database } from "@packages/db";

const catalogueRouter = new OpenAPIHono<{ Bindings: Env }>({ defaultHook });

const sampleProgramsRoute = createRoute({
  summary: "Sample Programs",
  operationId: "getSamplePrograms",
  tags: ["Catalogue"],
  method: "get",
  path: "/sample-programs",
  description: "List sample programs in UCI's current catalogue.",
  request: { query: sampleProgramsQuerySchema },
  responses: {
    200: response200(sampleProgramsResponseSchema),
    404: response404("Sample program data not found"),
    500: response500(),
  },
});

catalogueRouter.get(
  "*",
  productionCache({ cacheName: "anteater-api", cacheControl: "max-age=86400" }),
);

catalogueRouter.openapi(sampleProgramsRoute, async (c) => {
  const query = c.req.valid("query");
  const service = new ProgramsService(database(c.env.DB.connectionString));
  const res = await service.getSamplePrograms(query);
  if (query?.id && res.length === 0) {
    return c.json(
      {
        ok: false,
        message: `Sample program '${query.id}' not found`,
      },
      404,
    );
  }
  return c.json({ ok: true, data: sampleProgramsResponseSchema.parse(res) }, 200);
});

export { catalogueRouter };
