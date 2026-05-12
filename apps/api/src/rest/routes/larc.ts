import { createRoute, OpenAPIHono } from "@hono/zod-openapi";
import { database } from "@packages/db";
import { defaultHook } from "$hooks";
import { productionCache } from "$middleware";
import {
  larcQuerySchema,
  larcResponseSchema,
  response200,
  response422,
  response500,
} from "$schema";
import { LarcService } from "../../services/larc.ts";

const larcRouter = new OpenAPIHono<{ Bindings: Env }>({ defaultHook });

const larcSectionsRoute = createRoute({
  summary: "Query LARC sections",
  operationId: "larc",
  tags: ["LARC"],
  method: "get",
  path: "/",
  deprecated: true,
  description:
    "Retrieves LARC sections data matching the given filters.\n\n**Deprecation Notice:** As of Spring 2026, UCI has disbanded the legacy LARC section system. There are currently no plans to serve the data offered by the new system but this may change in the future.",
  request: { query: larcQuerySchema },
  responses: {
    200: response200(larcResponseSchema),
    422: response422(),
    500: response500(),
  },
});

larcRouter.get("*", productionCache({ cacheName: "anteater-api", cacheControl: "max-age=300" }));

larcRouter.openapi(larcSectionsRoute, async (c) => {
  const query = c.req.valid("query");
  const service = new LarcService(database(c.env.DB.connectionString));
  return c.json(
    {
      ok: true,
      data: larcResponseSchema.parse(await service.getLarcSections(query)),
    },
    200,
  );
});

export { larcRouter };
