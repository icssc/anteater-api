import { defaultHook } from "$hooks";
import { productionCache } from "$middleware";
import { errorSchema, responseSchema } from "$schema";
import type { Bindings } from "$types/bindings";
import { OpenAPIHono, createRoute } from "@hono/zod-openapi";
import { database } from "@packages/db";
import { larcQuerySchema, larcSectionSchema } from "../../schema/larc.ts";
import { LarcService } from "../../services/larc.ts";

const larcRouter = new OpenAPIHono<{ Bindings: Bindings }>({ defaultHook });

const allLarcSectionsRoute = createRoute({
  summary: "List all LARC sections",
  operationId: "allLarc",
  tags: ["LARC"],
  method: "get",
  path: "/all",
  description: "Retrieves all LARC sections data.",
  responses: {
    200: {
      content: {
        "application/json": {
          schema: responseSchema(larcSectionSchema.array()),
        },
      },
      description: "Successful operation",
    },
    500: {
      content: { "application/json": { schema: errorSchema } },
      description: "Server error occurred",
    },
  },
});

const larcSectionsRoute = createRoute({
  summary: "Query LARC sections",
  operationId: "larc",
  tags: ["LARC"],
  method: "get",
  path: "/",
  description: "Retrieves LARC sections data matching the given filters.",
  request: { query: larcQuerySchema },
  responses: {
    200: {
      content: {
        "application/json": {
          schema: responseSchema(larcSectionSchema.array()),
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

larcRouter.get("*", productionCache({ cacheName: "anteater-api", cacheControl: "max-age=300" }));

larcRouter.openapi(allLarcSectionsRoute, async (c) => {
  const service = new LarcService(database(c.env.DB.connectionString));
  return c.json(
    {
      ok: true,
      data: larcSectionSchema.array().parse(await service.getAllLarcSections()),
    },
    200,
  );
});

larcRouter.openapi(larcSectionsRoute, async (c) => {
  const query = c.req.valid("query");
  const service = new LarcService(database(c.env.DB.connectionString, { logger: true }));
  return c.json(
    {
      ok: true,
      data: larcSectionSchema.array().parse(await service.getLarcSections(query)),
    },
    200,
  );
});

export { larcRouter };
