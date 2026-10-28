import { createRoute, OpenAPIHono } from "@hono/zod-openapi";
import { database } from "@packages/db";
import { defaultHook } from "$hooks";
import { productionCache } from "$middleware";
import {
  ibExamsQuerySchema,
  ibExamsResponseSchema,
  response200,
  response404,
  response500,
} from "$schema";
import { IBExamsService } from "$services";

const ibExamsRouter = new OpenAPIHono<{ Bindings: Env }>({ defaultHook });

// AP already registers the shared coursesGrantedTree schema for the combined OpenAPI document
const ibExamsRoute = createRoute({
  summary: "Retrieve IB Exam names and rewards",
  operationId: "ibExams",
  tags: ["IB Exams"],
  method: "get",
  path: "/",
  description:
    "Get IB exam data: mappings from IB exam names to UCI Catalogue names and course credit for each eligible score.",
  request: { query: ibExamsQuerySchema },
  responses: {
    200: response200(ibExamsResponseSchema),
    404: response404("IB Exam mapping not found"),
    500: response500(),
  },
});

ibExamsRouter.get(
  "*",
  productionCache({ cacheName: "anteater-api", cacheControl: "max-age=86400" }),
);

ibExamsRouter.openapi(ibExamsRoute, async (c) => {
  const query = c.req.valid("query");
  const service = new IBExamsService(database(c.env.DB.connectionString));
  const res = await service.getIBExams(query);

  return res.length
    ? c.json({ ok: true, data: ibExamsResponseSchema.parse(res) }, 200)
    : c.json(
        {
          ok: false,
          message: "Can't find any IB Exams; is your id correct?",
        },
        404,
      );
});

export { ibExamsRouter };
