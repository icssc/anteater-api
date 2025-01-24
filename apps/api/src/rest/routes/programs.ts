import { defaultHook } from "$hooks";
import { productionCache } from "$middleware";
import {
  errorSchema,
  majorRequirementsQuerySchema,
  minorRequirementsQuerySchema,
  programRequirementsResponseSchema,
  responseSchema,
  specializationRequirementsQuerySchema,
} from "$schema";
import { ProgramsService } from "$services";
import { OpenAPIHono, createRoute } from "@hono/zod-openapi";
import { database } from "@packages/db";

const programsRouter = new OpenAPIHono<{ Bindings: Env }>({ defaultHook });

const majorRequirements = createRoute({
  summary: "Retrieve major requirements",
  operationId: "majorRequirements",
  tags: ["Programs"],
  method: "get",
  path: "/major",
  description: "Retrieve course requirements for a major in UCI's current catalog.",
  request: { query: majorRequirementsQuerySchema },
  responses: {
    200: {
      content: {
        "application/json": { schema: responseSchema(programRequirementsResponseSchema) },
      },
      description: "Successful operation",
    },
    404: {
      content: { "application/json": { schema: errorSchema } },
      description: "Major not found",
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

const minorRequirements = createRoute({
  summary: "Retrieve minor requirements",
  operationId: "minorRequirements",
  tags: ["Programs"],
  method: "get",
  path: "/minor",
  description: "Retrieve course requirements for a minor in UCI's current catalog.",
  request: { query: minorRequirementsQuerySchema },
  responses: {
    200: {
      content: {
        "application/json": { schema: responseSchema(programRequirementsResponseSchema) },
      },
      description: "Successful operation",
    },
    404: {
      content: { "application/json": { schema: errorSchema } },
      description: "Minor not found",
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

const specializationRequirements = createRoute({
  summary: "Retrieve specialization requirements",
  operationId: "specializationRequirements",
  tags: ["Programs"],
  method: "get",
  path: "/specialization",
  description: "Retrieve course requirements for a specialization in UCI's current catalog.",
  request: { query: specializationRequirementsQuerySchema },
  responses: {
    200: {
      content: {
        "application/json": { schema: responseSchema(programRequirementsResponseSchema) },
      },
      description: "Successful operation",
    },
    404: {
      content: { "application/json": { schema: errorSchema } },
      description: "Specialization not found",
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

programsRouter.get(
  "*",
  productionCache({ cacheName: "anteater-api", cacheControl: "max-age=86400" }),
);

const handler = async (c) => {
  // safety: we enumerated these options above
  const programType = (c.req.routePath.split("/").at(-1) ?? "major") as
    | "major"
    | "minor"
    | "specialization";

  const query = c.req.valid("query");
  const service = new ProgramsService(database(c.env.DB.connectionString));
  const res = await service.getProgramRequirements(programType, query);
  return res
    ? c.json({ ok: true, data: programRequirementsResponseSchema.parse(res) }, 200)
    : c.json(
        {
          ok: false,
          message: `Couldn't find this program; check your ID?`,
        },
        404,
      );
};

programsRouter.openapi(majorRequirements, handler);
programsRouter.openapi(minorRequirements, handler);
programsRouter.openapi(specializationRequirements, handler);

export { programsRouter };
