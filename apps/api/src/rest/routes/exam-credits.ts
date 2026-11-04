import { createRoute, OpenAPIHono } from "@hono/zod-openapi";
import { database } from "@packages/db";
import { defaultHook } from "$hooks";
import { productionCache } from "$middleware";
import {
  apExamsQuerySchema,
  apExamsResponseSchema,
  coursesGrantedTreeSchema,
  ibExamsQuerySchema,
  ibExamsResponseSchema,
  response200,
  response404,
  response500,
} from "$schema";
import { APExamsService, IBExamsService } from "$services";

type ExamQuery = {
  fullName?: string;
  catalogueName?: string;
};

type ExamRouteConfig = {
  examType: "AP" | "IB";
  querySchema: typeof apExamsQuerySchema;
  responseSchema: typeof apExamsResponseSchema;
  description: string;
  getExams: (
    db: ReturnType<typeof database>,
    query: ExamQuery,
  ) => ReturnType<APExamsService["getAPExams"]>;
};

function createExamRouter(config: ExamRouteConfig) {
  const router = new OpenAPIHono<{ Bindings: Env }>({ defaultHook });

  const route = createRoute({
    summary: `Retrieve ${config.examType} Exam names and rewards`,
    operationId: config.examType === "AP" ? "apExams" : "ibExams",
    tags: [`${config.examType} Exams`],
    method: "get",
    path: "/",
    description: config.description,
    request: { query: config.querySchema },
    responses: {
      200: response200(config.responseSchema),
      404: response404(`${config.examType} Exam mapping not found`),
      500: response500(),
    },
  });

  router.get(
    "*",
    productionCache({
      cacheName: "anteater-api",
      cacheControl: "max-age=86400",
    }),
  );

  router.openapi(route, async (c) => {
    const query = c.req.valid("query");
    const db = database(c.env.DB.connectionString);
    const exams = await config.getExams(db, query);

    return exams.length
      ? c.json({ ok: true, data: config.responseSchema.parse(exams) }, 200)
      : c.json(
          {
            ok: false,
            message: `Can't find any ${config.examType} Exams; is your id correct?`,
          },
          404,
        );
  });

  return router;
}

export const apExamsRouter = createExamRouter({
  examType: "AP",
  querySchema: apExamsQuerySchema,
  responseSchema: apExamsResponseSchema,
  description:
    "Get AP exam data: mappings from College Board exam names to UCI Catalogue names and course credit for each exam score.",
  getExams: (db, query) => new APExamsService(db).getAPExams(query),
});

export const ibExamsRouter = createExamRouter({
  examType: "IB",
  querySchema: ibExamsQuerySchema,
  responseSchema: ibExamsResponseSchema,
  description:
    "Get IB exam data: mappings from IB exam names to UCI Catalogue names and course credit for each eligible score.",
  getExams: (db, query) => new IBExamsService(db).getIBExams(query),
});

// Register the shared recursive schema once.
apExamsRouter.openAPIRegistry.register("coursesGrantedTree", coursesGrantedTreeSchema);
