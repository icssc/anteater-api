import { defaultHook } from "$hooks";
import { productionCache } from "$middleware";
import {
  errorSchema,
  majorRequirementsQuerySchema,
  majorRequirementsResponseSchema,
  majorsResponseSchema,
  minorRequirementsQuerySchema,
  minorRequirementsResponseSchema,
  minorsResponseSchema,
  programRequirementSchema,
  responseSchema,
  specializationRequirementsQuerySchema,
  specializationRequirementsResponseSchema,
  specializationsResponseSchema,
} from "$schema";
import { ProgramsService } from "$services";
import { OpenAPIHono, createRoute } from "@hono/zod-openapi";
import { database } from "@packages/db";

const programsRouter = new OpenAPIHono<{ Bindings: Env }>({ defaultHook });

programsRouter.openAPIRegistry.register("programRequirement", programRequirementSchema);

const majorsRoute = createRoute({
  summary: "Retrieve majors",
  operationId: "getMajors",
  tags: ["Programs"],
  method: "get",
  path: "/majors",
  description: "List all available majors in UCI's current catalog.",
  responses: {
    200: {
      content: {
        "application/json": { schema: responseSchema(majorsResponseSchema) },
      },
      description: "Successful operation",
    },
    500: {
      content: { "application/json": { schema: errorSchema } },
      description: "Server error occurred",
    },
  },
});

const minorsRoute = createRoute({
  summary: "Retrieve minors",
  operationId: "getMinors",
  tags: ["Programs"],
  method: "get",
  path: "/minors",
  description: "List all available majors in UCI's current catalog.",
  responses: {
    200: {
      content: {
        "application/json": { schema: responseSchema(minorsResponseSchema) },
      },
      description: "Successful operation",
    },
    500: {
      content: { "application/json": { schema: errorSchema } },
      description: "Server error occurred",
    },
  },
});

const specializationsRoute = createRoute({
  summary: "Retrieve specializations",
  operationId: "getSpecializations",
  tags: ["Programs"],
  method: "get",
  path: "/specializations",
  description: "List all available majors in UCI's current catalog.",
  responses: {
    200: {
      content: {
        "application/json": { schema: responseSchema(specializationsResponseSchema) },
      },
      description: "Successful operation",
    },
    500: {
      content: { "application/json": { schema: errorSchema } },
      description: "Server error occurred",
    },
  },
});

const majorRequirements = createRoute({
  summary: "Retrieve major requirements",
  operationId: "majorRequirements",
  tags: ["Programs"],
  method: "get",
  path: "/major",
  description:
    "Retrieve course requirements for a major in UCI's current catalog. Note that these are the requirements for the major itself; " +
    "if this major has specializations, then one is mandatory and its requirements apply as well.",
  request: { query: majorRequirementsQuerySchema },
  responses: {
    200: {
      content: {
        "application/json": { schema: responseSchema(majorRequirementsResponseSchema) },
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
        "application/json": { schema: responseSchema(minorRequirementsResponseSchema) },
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
        "application/json": { schema: responseSchema(specializationRequirementsResponseSchema) },
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

// TODO: add queries for each route
// TODO: use terniary operator for handling queries
programsRouter.openapi(majorsRoute, async (c) => {
  const service = new ProgramsService(database(c.env.DB.connectionString));
  const res = await service.getPrograms("major");
  return c.json({ ok: true, data: res }, 200);
});

programsRouter.openapi(minorsRoute, async (c) => {
  const service = new ProgramsService(database(c.env.DB.connectionString));
  const res = await service.getPrograms("minor");
  return c.json({ ok: true, data: res }, 200);
});

programsRouter.openapi(specializationsRoute, async (c) => {
  const service = new ProgramsService(database(c.env.DB.connectionString));
  const res = await service.getPrograms("specialization");
  return c.json({ ok: true, data: res }, 200);
});

programsRouter.openapi(majorRequirements, async (c) => {
  const query = c.req.valid("query");
  const service = new ProgramsService(database(c.env.DB.connectionString));
  const res = await service.getProgramRequirements("major", query);
  return res
    ? c.json({ ok: true, data: majorRequirementsResponseSchema.parse(res) }, 200)
    : c.json(
        {
          ok: false,
          message: "Couldn't find this major; check your ID?",
        },
        404,
      );
});
programsRouter.openapi(minorRequirements, async (c) => {
  const query = c.req.valid("query");
  const service = new ProgramsService(database(c.env.DB.connectionString));
  const res = await service.getProgramRequirements("minor", query);
  return res
    ? c.json({ ok: true, data: minorRequirementsResponseSchema.parse(res) }, 200)
    : c.json(
        {
          ok: false,
          message: "Couldn't find this minor; check your ID?",
        },
        404,
      );
});
programsRouter.openapi(specializationRequirements, async (c) => {
  const query = c.req.valid("query");
  const service = new ProgramsService(database(c.env.DB.connectionString));
  const res = await service.getProgramRequirements("specialization", query);
  return res
    ? c.json({ ok: true, data: specializationRequirementsResponseSchema.parse(res) }, 200)
    : c.json(
        {
          ok: false,
          message: "Couldn't find this specialization; check your ID?",
        },
        404,
      );
});

export { programsRouter };
