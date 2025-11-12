import { defaultHook } from "$hooks";
import {
  errorSchema,
  libraryTrafficQuerySchema,
  libraryTrafficSchema,
  responseSchema,
} from "$schema";
import { LibraryTrafficService } from "$services";
import { OpenAPIHono, createRoute } from "@hono/zod-openapi";
import { database } from "@packages/db";

const libraryTrafficRouter = new OpenAPIHono<{ Bindings: Env }>({ defaultHook });

const libraryTrafficRoute = createRoute({
  summary: "Retrieve latest library traffic data",
  operationId: "libraryTraffic",
  tags: ["Library Traffic"],
  method: "get",
  path: "/",
  request: { query: libraryTrafficQuerySchema },
  description: "Retrieves the latest library occupancy metrics for specific library locations",
  responses: {
    200: {
      content: {
        "application/json": { schema: responseSchema(libraryTrafficSchema) },
      },
      description: "Successful operation",
    },
    400: {
      content: { "application/json": { schema: errorSchema } },
      description: "No matching data found for provided parameters",
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

libraryTrafficRouter.openapi(libraryTrafficRoute, async (c) => {
  const query = c.req.valid("query");
  const service = new LibraryTrafficService(database(c.env.DB.connectionString));
  const res = await service.getLibraryTraffic(query);

  if (res.length === 0) {
    return c.json(
      { ok: false, message: "Library traffic data not found: check for typos in query" },
      400,
    );
  }

  return c.json({ ok: true, data: libraryTrafficSchema.parse(res) }, 200);
});

export { libraryTrafficRouter };
