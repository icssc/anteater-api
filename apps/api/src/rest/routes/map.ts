import { defaultHook } from "$hooks";
import { productionCache } from "$middleware";
import { errorSchema, mapQuerySchema, mapResponseSchema, responseSchema } from "$schema";
import { MapService } from "$services";
import { OpenAPIHono, createRoute } from "@hono/zod-openapi";
import { database } from "@packages/db";

const mapRouter = new OpenAPIHono<{ Bindings: Env }>({ defaultHook });

const mapLocationsRoute = createRoute({
  summary: "Retrieve coordinates for UCI points of interest",
  operationId: "getLocations",
  tags: ["Map"],
  method: "get",
  path: "/",
  description: "List all available data from UCI's interactive map",
  request: { query: mapQuerySchema },
  responses: {
    200: {
      content: {
        "application/json": { schema: responseSchema(mapResponseSchema) },
      },
      description: "Successful operation",
    },
    404: {
      content: { "application/json": { schema: errorSchema } },
      description: "Location data not found",
    },
    500: {
      content: { "application/json": { schema: errorSchema } },
      description: "Server error occurred",
    },
  },
});

mapRouter.get("*", productionCache({ cacheName: "anteater-api", cacheControl: "max-age=86400" }));

mapRouter.openapi(mapLocationsRoute, async (c) => {
  const query = c.req.valid("query");
  const service = new MapService(database(c.env.DB.connectionString));
  const res = await service.getLocations(query);
  if (query?.id && !res.length) {
    return c.json({ ok: false, message: "No data for a location by that ID" }, 404);
  }
  return c.json({ ok: true, data: mapResponseSchema.parse(res) }, 200);
});

export { mapRouter };
