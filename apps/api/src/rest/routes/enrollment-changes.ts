import { defaultHook } from "$hooks";
import { productionCache } from "$middleware";
import {
  enrollmentChangesBodySchema,
  enrollmentChangesQuerySchema,
  enrollmentChangesSchema,
  errorSchema,
  responseSchema,
} from "$schema";
import { EnrollmentChangesService } from "$services";
import { OpenAPIHono, createRoute } from "@hono/zod-openapi";
import { database } from "@packages/db";

const enrollmentChangesRouter = new OpenAPIHono<{ Bindings: Env }>({
  defaultHook,
});

const enrollmentChangesRoute = createRoute({
  summary: "Retrieve section enrollment changes",
  operationId: "enrollmentChanges",
  tags: ["Enrollment Changes"],
  method: "post",
  path: "/",
  request: {
    query: enrollmentChangesQuerySchema,
    body: {
      content: { "application/json": { schema: enrollmentChangesBodySchema } },
      required: true,
    },
  },
  description:
    'Retrieve paired "from" and "to" enrollment snapshots of course section(s). ' +
    "The primary parameter of interest is `since`, a datetime sometime in the past. " +
    "The `from` snapshot describes the state at `since` (i.e. the latest snapshot not later than `since`). " +
    "If `since` is too far in the past (we make no guarantees about how far), such a snapshot may not have been retained and the `from` snapshot will be absent. " +
    "The `to` snapshot will always be the latest known state of a section. " +
    "If these snapshots are not distinct, only `to` will be returned.",
  responses: {
    200: {
      content: {
        "application/json": {
          schema: responseSchema(enrollmentChangesSchema),
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

enrollmentChangesRouter.get(
  "*",
  productionCache({ cacheName: "anteater-api", cacheControl: "max-age=300" }),
);

enrollmentChangesRouter.openapi(enrollmentChangesRoute, async (c) => {
  const params = c.req.valid("query");
  const body = c.req.valid("json");
  const service = new EnrollmentChangesService(database(c.env.DB.connectionString));
  return c.json(
    {
      ok: true,
      data: enrollmentChangesSchema.parse(await service.getEnrollmentChanges(params, body)),
    },
    200,
  );
});

export { enrollmentChangesRouter };
