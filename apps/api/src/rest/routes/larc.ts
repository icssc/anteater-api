import { defaultHook } from "$hooks";
import { productionCache } from "$middleware";
import { responseSchema } from "$schema";
import { larcQuerySchema, larcResponseSchema } from "$schema";
import { OpenAPIHono, createRoute } from "@hono/zod-openapi";
import { database } from "@packages/db";
import { LarcService } from "../../services/larc.ts";
import { response200, response422, response500 } from "./base";

const larcRouter = new OpenAPIHono<{ Bindings: Env }>({ defaultHook });

const larcSectionsRoute = createRoute({
  summary: "Query LARC sections",
  operationId: "larc",
  tags: ["LARC"],
  method: "get",
  path: "/",
  description: "Retrieves LARC sections data matching the given filters.",
  request: { query: larcQuerySchema },
  responses: {
    200: response200(responseSchema(larcResponseSchema)),
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
