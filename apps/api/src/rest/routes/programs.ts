import { defaultHook } from "$hooks";
import { productionCache } from "$middleware";
import {
  errorSchema,
  programRequirementsQuerySchema,
  programRequirementsResponseSchema,
  responseSchema,
} from "$schema";
import { ProgramsService } from "$services";
import { OpenAPIHono, createRoute } from "@hono/zod-openapi";
import { database } from "@packages/db";

const programsRouter = new OpenAPIHono<{ Bindings: Env }>({ defaultHook });

const programsRoute = createRoute({
  summary: "Retrieve academic programs",
  operationId: "programs",
  tags: ["Programs"],
  method: "get",
  path: "/",
  description:
    "List and retrieve requirements for major, minor, and specialization programs in UCI's current catalog.",
  request: { query: programRequirementsQuerySchema },
  responses: {
    200: {
      content: {
        "application/json": { schema: responseSchema(programRequirementsResponseSchema) },
      },
      description: "Successful operation",
    },
    404: {
      content: { "application/json": { schema: errorSchema } },
      description: "Program not found",
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

programsRouter.get(
  "*",
  productionCache({ cacheName: "anteater-api", cacheControl: "max-age=86400" }),
);

programsRouter.openapi(programsRoute, async (c) => {
  const query = c.req.valid("query");
  const service = new ProgramsService(database(c.env.DB.connectionString));
  const res = await service.getProgramRequirements("major", query);
  return res
    ? c.json({ ok: true, data: programRequirementsResponseSchema.parse(res) }, 200)
    : c.json(
        {
          ok: false,
          message: `Couldn't find this program; check your ID?`,
        },
        404,
      );
});

export { programsRouter };
