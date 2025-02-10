import { defaultHook } from "$hooks";
import { productionCache } from "$middleware";
import { apExamsQuerySchema, apExamsResponseSchema, errorSchema, responseSchema } from "$schema";
import { apExamsService } from "$services";
import { OpenAPIHono, createRoute } from "@hono/zod-openapi";
import { database } from "@packages/db";

const apExamsRouter = new OpenAPIHono<{ Bindings: Env }>({ defaultHook });

const apExamsRoute = createRoute({
  summary: "Retrieve AP Exam names",
  operationId: "apExams",
  tags: ["AP Exams"],
  method: "get",
  path: "/",
  description:
    "Get a mapping from AP exam names as they appear in the UCI Catalogue to their official names as given by College Board",
  request: { query: apExamsQuerySchema },
  responses: {
    200: {
      content: { "application/json": { schema: responseSchema(apExamsResponseSchema) } },
      description: "Successful operation",
    },
    404: {
      content: { "application/json": { schema: errorSchema } },
      description: "AP Exam mapping not found",
    },
    500: {
      content: { "application/json": { schema: errorSchema } },
      description: "Server error occurred",
    },
  },
});

apExamsRouter.get(
  "*",
  productionCache({ cacheName: "anteater-api", cacheControl: "max-age=86400" }),
);

apExamsRouter.openapi(apExamsRoute, async (c) => {
  const query = c.req.valid("query");
  const service = new apExamsService(database(c.env.DB.connectionString));
  const res = await service.getAPExams(query);
  return res.length
    ? c.json({ ok: true, data: apExamsResponseSchema.parse(res) }, 200)
    : c.json(
        {
          ok: false,
          message: "Can't find any AP Exams; is your id correct?",
        },
        404,
      );
});

export { apExamsRouter };
