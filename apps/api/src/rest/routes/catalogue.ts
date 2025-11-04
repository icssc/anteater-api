import { defaultHook } from "$hooks";
import { productionCache } from "$middleware";
import {
  errorSchema,
  responseSchema,
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
  description: "List all available sample programs in UCI's current catalogue.",
  request: { query: sampleProgramsQuerySchema },
  responses: {
    200: {
      content: {
        "application/json": {
          schema: responseSchema(sampleProgramsResponseSchema),
        },
      },
      description: "Successful operation",
    },
    404: {
      content: { "application/json": { schema: errorSchema } },
      description: "Sample program data not found",
    },
    500: {
      content: { "application/json": { schema: errorSchema } },
      description: "Server error occurred",
    },
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

  if (query?.id && !res.length) {
    return c.json(
      {
        ok: false,
        message: "No data for a sample program by that ID",
      },
      404,
    );
  }

  return c.json({ ok: true, data: sampleProgramsResponseSchema.parse(res) }, 200);
});

export { catalogueRouter };
