import { defaultHook } from "$hooks";
import { productionCache } from "$middleware";
import { accessController } from "$middleware";
import { responseSchema, searchQuerySchema, searchResponseSchema } from "$schema";
import { CoursesService, InstructorsService, SearchService } from "$services";
import { OpenAPIHono, createRoute } from "@hono/zod-openapi";
import { database } from "@packages/db";
import { response200, response422, response500 } from "./base";

const searchRouter = new OpenAPIHono<{ Bindings: Env }>({ defaultHook });

const searchRoute = createRoute({
  summary: "Retrieve search results",
  operationId: "search",
  tags: ["Other"],
  method: "get",
  path: "/",
  request: { query: searchQuerySchema },
  description: "Retrieves course/instructor results for the given search query.",
  responses: {
    200: response200(responseSchema(searchResponseSchema)),
    422: response422(),
    500: response500(),
  },
});

searchRouter.use("*", accessController("FUZZY_SEARCH"));
searchRouter.get(
  "*",
  productionCache({ cacheName: "anteater-api", cacheControl: "max-age=86400" }),
);

searchRouter.openapi(searchRoute, async (c) => {
  const query = c.req.valid("query");
  const db = database(c.env.DB.connectionString);
  const service = new SearchService(db, new CoursesService(db), new InstructorsService(db));
  return c.json({ ok: true, data: searchResponseSchema.parse(await service.doSearch(query)) }, 200);
});

export { searchRouter };
