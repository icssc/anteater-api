import { defaultHook } from "$hooks";
import { productionCache } from "$middleware";
import {
  apExamsQuerySchema,
  apExamsResponseSchema,
  coursesGrantedTreeSchema,
  errorSchema,
  responseSchema,
} from "$schema";
import { APExamsService } from "$services";
import { OpenAPIHono, createRoute } from "@hono/zod-openapi";
import { database } from "@packages/db";

const apExamsRouter = new OpenAPIHono<{ Bindings: Env }>({ defaultHook });

apExamsRouter.openAPIRegistry.register("coursesGrantedTree", coursesGrantedTreeSchema);

const apExamsRoute = createRoute({
  summary: "Retrieve AP Exam names and rewards",
  operationId: "apExams",
  tags: ["AP Exams"],
  method: "get",
  path: "/",
  description:
    "Get AP exam data: mappings from College Board exam names to UCI Catalogue names and course credit for each exam score.",
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
  const service = new APExamsService(database(c.env.DB.connectionString));
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
