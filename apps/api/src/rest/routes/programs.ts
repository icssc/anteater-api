import { defaultHook } from "$hooks";
import { productionCache } from "$middleware";
import {
  majorRequirementsQuerySchema,
  majorRequirementsResponseSchema,
  majorsQuerySchema,
  majorsResponseSchema,
  minorRequirementsQuerySchema,
  minorRequirementsResponseSchema,
  minorsQuerySchema,
  minorsResponseSchema,
  programRequirementSchema,
  responseSchema,
  specializationRequirementsQuerySchema,
  specializationRequirementsResponseSchema,
  specializationsQuerySchema,
  specializationsResponseSchema,
  ugradRequirementsQuerySchema,
  ugradRequirementsResponseSchema,
} from "$schema";
import { ProgramsService } from "$services";
import { OpenAPIHono, createRoute } from "@hono/zod-openapi";
import { database } from "@packages/db";
import { response200, response404, response422, response500 } from "./base";

const programsRouter = new OpenAPIHono<{ Bindings: Env }>({ defaultHook });

programsRouter.openAPIRegistry.register("programRequirement", programRequirementSchema);

const majorsRoute = createRoute({
  summary: "Retrieve majors",
  operationId: "getMajors",
  tags: ["Programs"],
  method: "get",
  path: "/majors",
  description: "List all available majors in UCI's current catalogue.",
  request: { query: majorsQuerySchema },
  responses: {
    200: response200(responseSchema(majorsResponseSchema)),
    404: response404("Major data not found"),
    500: response500(),
  },
});

const minorsRoute = createRoute({
  summary: "Retrieve minors",
  operationId: "getMinors",
  tags: ["Programs"],
  method: "get",
  path: "/minors",
  description: "List all available majors in UCI's current catalogue.",
  request: { query: minorsQuerySchema },
  responses: {
    200: response200(responseSchema(minorsResponseSchema)),
    404: response404("Minor data not found"),
    500: response500(),
  },
});

const specializationsRoute = createRoute({
  summary: "Retrieve specializations",
  operationId: "getSpecializations",
  tags: ["Programs"],
  method: "get",
  path: "/specializations",
  description: "List all available majors in UCI's current catalogue.",
  request: { query: specializationsQuerySchema },
  responses: {
    200: response200(responseSchema(specializationsResponseSchema)),
    404: response404("Specialization data not found"),
    500: response500(),
  },
});

const majorRequirements = createRoute({
  summary: "Retrieve major requirements",
  operationId: "majorRequirements",
  tags: ["Programs"],
  method: "get",
  path: "/major",
  description:
    "Retrieve course requirements for a major in UCI's current catalogue. Note that these are the requirements for the major itself; " +
    "if this major has specializations, then one is mandatory and its requirements apply as well.",
  request: { query: majorRequirementsQuerySchema },
  responses: {
    200: response200(responseSchema(majorRequirementsResponseSchema)),
    404: response404("Major not found"),
    422: response422(),
    500: response500(),
  },
});

const minorRequirements = createRoute({
  summary: "Retrieve minor requirements",
  operationId: "minorRequirements",
  tags: ["Programs"],
  method: "get",
  path: "/minor",
  description: "Retrieve course requirements for a minor in UCI's current catalogue.",
  request: { query: minorRequirementsQuerySchema },
  responses: {
    200: response200(responseSchema(minorRequirementsResponseSchema)),
    404: response404("Minor not found"),
    422: response422(),
    500: response500(),
  },
});

const specializationRequirements = createRoute({
  summary: "Retrieve specialization requirements",
  operationId: "specializationRequirements",
  tags: ["Programs"],
  method: "get",
  path: "/specialization",
  description: "Retrieve course requirements for a specialization in UCI's current catalogue.",
  request: { query: specializationRequirementsQuerySchema },
  responses: {
    200: response200(responseSchema(specializationRequirementsResponseSchema)),
    404: response404("Specialization not found"),
    422: response422(),
    500: response500(),
  },
});

const ugradRequirements = createRoute({
  summary: "Retrieve undergraduate requirements",
  operationId: "ugradRequirements",
  tags: ["Programs"],
  method: "get",
  path: "/ugradRequirements",
  description: "Retrieve requirements external to, but required for, for all undergraduate degrees",
  request: { query: ugradRequirementsQuerySchema },
  responses: {
    200: response200(responseSchema(ugradRequirementsResponseSchema)),
    404: response404("Specialization not found"),
    422: response422(),
    500: response500(),
  },
});

programsRouter.get(
  "*",
  productionCache({ cacheName: "anteater-api", cacheControl: "max-age=86400" }),
);

programsRouter.openapi(majorsRoute, async (c) => {
  const query = c.req.valid("query");
  const service = new ProgramsService(database(c.env.DB.connectionString));
  const res = await service.getMajors(query);
  if (query?.id && !res.length) {
    return c.json({ ok: false, message: "No data for a major by that ID" }, 404);
  }
  return c.json({ ok: true, data: majorsResponseSchema.parse(res) }, 200);
});

programsRouter.openapi(minorsRoute, async (c) => {
  const query = c.req.valid("query");
  const service = new ProgramsService(database(c.env.DB.connectionString));
  const res = await service.getMinors(query);
  if (query?.id && !res.length) {
    return c.json({ ok: false, message: "No data for a minor by that ID" }, 404);
  }
  return c.json({ ok: true, data: minorsResponseSchema.parse(res) }, 200);
});

programsRouter.openapi(specializationsRoute, async (c) => {
  const query = c.req.valid("query");
  const service = new ProgramsService(database(c.env.DB.connectionString));
  const res = await service.getSpecializations(query);
  if (query?.majorId && !res.length) {
    return c.json(
      {
        ok: false,
        message: "No data on specializations for a major by that ID",
      },
      404,
    );
  }
  return c.json({ ok: true, data: specializationsResponseSchema.parse(res) }, 200);
});

programsRouter.openapi(majorRequirements, async (c) => {
  const query = c.req.valid("query");
  const service = new ProgramsService(database(c.env.DB.connectionString));
  const res = await service.getMajorRequirements(query);
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
  const res = await service.getMinorRequirements(query);
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
  const res = await service.getSpecializationRequirements(query);
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

programsRouter.openapi(ugradRequirements, async (c) => {
  const query = c.req.valid("query");
  const service = new ProgramsService(database(c.env.DB.connectionString));
  const res = await service.getUgradRequirements(query);
  return res
    ? c.json({ ok: true, data: ugradRequirementsResponseSchema.parse(res) }, 200)
    : c.json(
        {
          ok: false,
          message: "Couldn't find this undergraduate requirements block; check your ID?",
        },
        404,
      );
});

export { programsRouter };
