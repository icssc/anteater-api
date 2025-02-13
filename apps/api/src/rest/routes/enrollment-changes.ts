import { defaultHook } from "$hooks";
import { productionCache } from "$middleware";
import {
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
  summary: "Filter enrollment changes",
  operationId: "enrollmentChanges",
  tags: ["Enrollment Changes"],
  method: "get",
  path: "/",
  request: { query: enrollmentChangesQuerySchema },
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
  const query = c.req.valid("query");
  const service = new EnrollmentChangesService(database(c.env.DB.connectionString));
  return c.json(
    {
      ok: true,
      data: enrollmentChangesSchema.parse(await service.getEnrollmentChanges(query)),
    },
    200,
  );
});

export { enrollmentChangesRouter };
