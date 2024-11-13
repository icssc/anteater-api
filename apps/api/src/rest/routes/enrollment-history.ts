import { defaultHook } from "$hooks";
import { productionCache } from "$middleware";
import {
  enrollmentHistoryQuerySchema,
  enrollmentHistorySchema,
  errorSchema,
  responseSchema,
} from "$schema";
import { EnrollmentHistoryService } from "$services";
import type { Bindings } from "$types/bindings";
import { OpenAPIHono, createRoute } from "@hono/zod-openapi";
import { database } from "@packages/db";

const enrollmentHistoryRouter = new OpenAPIHono<{ Bindings: Bindings }>({
  defaultHook,
});

const enrollmentHistoryRoute = createRoute({
  summary: "Filter enrollment history",
  operationId: "enrollmentHistory",
  tags: ["Enrollment History"],
  method: "get",
  path: "/",
  request: { query: enrollmentHistoryQuerySchema },
  description:
    "Retrieves historical enrollment data for the given parameters. Granular history arrays only available for recent terms.",
  responses: {
    200: {
      content: {
        "application/json": {
          schema: responseSchema(enrollmentHistorySchema.array()),
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

enrollmentHistoryRouter.get(
  "*",
  productionCache({ cacheName: "anteater-api", cacheControl: "max-age=300" }),
);

enrollmentHistoryRouter.openapi(enrollmentHistoryRoute, async (c) => {
  const query = c.req.valid("query");
  const service = new EnrollmentHistoryService(database(c.env.DB.connectionString));
  return c.json(
    {
      ok: true,
      data: enrollmentHistorySchema.array().parse(await service.getEnrollmentHistory(query)),
    },
    200,
  );
});

export { enrollmentHistoryRouter };
