import { defaultHook } from "$hooks";
import { productionCache } from "$middleware";
import {
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
import { response200, response422, response500 } from "./base";

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
    200: response200(responseSchema(websocResponseSchema)),
    422: response422(),
    500: response500(),
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
    200: response200(responseSchema(websocTermResponseSchema.array())),
    422: response422(),
    500: response500(),
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
    200: response200(responseSchema(websocDepartmentsResponseSchema)),
    422: response422(),
    500: response500(),
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
