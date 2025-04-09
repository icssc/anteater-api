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

const latestTrafficRoute = createRoute({
  summary: "Retrieve latest library traffic data",
  operationId: "latestLibraryTraffic",
  tags: ["Library Traffic"],
  method: "get",
  path: "/",
  request: { query: libraryTrafficQuerySchema },
  description: "Retrieves the most recent traffic data for all floors or a specific floor.",
  responses: {
    200: {
      content: {
        "application/json": { schema: responseSchema(libraryTrafficSchema.array()) },
      },
      description: "Successful operation",
    },
    500: {
      content: { "application/json": { schema: errorSchema } },
      description: "Server error occurred",
    },
  },
});

libraryTrafficRouter.openapi(latestTrafficRoute, async (c) => {
  const service = new LibraryTrafficService(database(c.env.DB.connectionString));
  const res = await service.getLatestTrafficData();

  return c.json({ ok: true, data: libraryTrafficSchema.array().parse(res) }, 200);
});

export { libraryTrafficRouter };
