import { defaultHook } from "$hooks";
import { productionCache } from "$middleware";
import {
  errorSchema,
  responseSchema,
  websocDepartmentsQuerySchema,
  websocDepartmentsResponseSchema,
  websocQuerySchema,
  websocResponseSchema,
  websocTermResponseSchema,
} from "$schema";
import { WebsocService } from "$services";
import { OpenAPIHono, createRoute } from "@hono/zod-openapi";
import { database } from "@packages/db";

const websocRouter = new OpenAPIHono<{ Bindings: Env }>({ defaultHook });

const websocRoute = createRoute({
  summary: "Query WebSoc",
  operationId: "websoc",
  tags: ["WebSoc"],
  method: "get",
  path: "/",
  description: "Retrieves WebSoc data satisfying the given parameters.",
  request: { query: websocQuerySchema },
  responses: {
    200: {
      content: {
        "application/json": { schema: responseSchema(websocResponseSchema) },
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

const websocTermsRoute = createRoute({
  summary: "List available WebSoc terms",
  operationId: "websocTerms",
  tags: ["WebSoc"],
  method: "get",
  path: "/terms",
  description: "Retrieve all terms currently available on WebSoc.",
  responses: {
    200: {
      content: {
        "application/json": {
          schema: responseSchema(websocTermResponseSchema.array()),
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

const websocDepartmentsRoute = createRoute({
  summary: "List existing WebSoc departments",
  operationId: "websocDepartments",
  tags: ["WebSoc"],
  method: "get",
  path: "/departments",
  description: "Retrieve departments which have appeared on WebSoc.",
  request: { query: websocDepartmentsQuerySchema },
  responses: {
    200: {
      content: {
        "application/json": {
          schema: responseSchema(websocDepartmentsResponseSchema),
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

websocRouter.get("*", productionCache({ cacheName: "anteater-api", cacheControl: "max-age=300" }));

websocRouter.openapi(websocRoute, async (c) => {
  const query = c.req.valid("query");
  const service = new WebsocService(database(c.env.DB.connectionString));
  return c.json(
    {
      ok: true,
      data: websocResponseSchema.parse(await service.getWebsocResponse(query)),
    },
    200,
  );
});

websocRouter.openapi(websocTermsRoute, async (c) => {
  const service = new WebsocService(database(c.env.DB.connectionString));
  return c.json({ ok: true, data: await service.getAllTerms() }, 200);
});

websocRouter.openapi(websocDepartmentsRoute, async (c) => {
  const query = c.req.valid("query");

  const service = new WebsocService(database(c.env.DB.connectionString));
  return c.json(
    { ok: true, data: websocDepartmentsResponseSchema.parse(await service.getDepartments(query)) },
    200,
  );
});

export { websocRouter };
