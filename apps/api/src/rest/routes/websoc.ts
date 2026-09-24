import { createRoute, OpenAPIHono } from "@hono/zod-openapi";
import { database } from "@packages/db";
import type { TypedResponse } from "hono";
import type { SuccessStatusCode } from "hono/utils/http-status";
import { defaultHook } from "$hooks";
import { productionCache } from "$middleware";
import {
  response200,
  response422,
  response500,
  syllabiQuerySchema,
  syllabiSchema,
  websocDepartmentsQuerySchema,
  websocDepartmentsResponseSchema,
  websocQuerySchema,
  websocResponseSchema,
  websocTermResponseSchema,
} from "$schema";
import { WebsocService } from "$services";

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
    200: response200(websocResponseSchema),
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
    200: response200(websocTermResponseSchema.array()),
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
    200: response200(websocDepartmentsResponseSchema),
    422: response422(),
    500: response500(),
  },
});

const websocSyllabiRoute = createRoute({
  summary: "Retrieve historical syllabi",
  operationId: "websocSyllabi",
  tags: ["WebSoc"],
  method: "get",
  path: "/syllabi",
  description: "Retrieves historical syllabus links for the given course.",
  request: { query: syllabiQuerySchema },
  responses: {
    200: response200(syllabiSchema.array()),
    422: response422(),
    500: response500(),
  },
});

websocRouter.get("*", productionCache({ cacheName: "anteater-api", cacheControl: "max-age=300" }));

websocRouter.openapi(websocRoute, async (c) => {
  const query = c.req.valid("query");
  const service = new WebsocService(database(c.env.DB.connectionString));
  // return c.json(
  //   {
  //     ok: true,
  //     data: websocResponseSchema.parse(await service.getWebsocResponse(query)),
  //   },
  //   200,
  // );
  const e = await service.getWebsocResponse(query);
  const r = c.newResponse(
    await service.getWebsocResponse(query), // should return a readable stream
    200,
    {
      "Content-Type": "application/json; charset=utf-8",
    },
  ) as any | (Response & TypedResponse<SuccessStatusCode, 200, "json">); // fix this type
  return r;
});

websocRouter.openapi(websocTermsRoute, async (c) => {
  const service = new WebsocService(database(c.env.DB.connectionString));
  const r = c.json({ ok: true, data: await service.getAllTerms() }, 200);
  return r;
});

websocRouter.openapi(websocDepartmentsRoute, async (c) => {
  const query = c.req.valid("query");

  const service = new WebsocService(database(c.env.DB.connectionString));
  return c.json(
    { ok: true, data: websocDepartmentsResponseSchema.parse(await service.getDepartments(query)) },
    200,
  );
});

websocRouter.openapi(websocSyllabiRoute, async (c) => {
  const query = c.req.valid("query");
  const service = new WebsocService(database(c.env.DB.connectionString));
  return c.json(
    {
      ok: true,
      data: syllabiSchema.array().parse(await service.getSyllabi(query)),
    },
    200,
  );
});

export { websocRouter };
