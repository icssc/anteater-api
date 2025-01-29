import type { GraphQLContext } from "$graphql/graphql-context";
import {
  majorRequirementsQuerySchema,
  majorsQuerySchema,
  minorRequirementsQuerySchema,
  minorsQuerySchema,
  type programRequirementSchema,
  specializationRequirementsQuerySchema,
  specializationsQuerySchema,
  ugradRequirementsQuerySchema,
} from "$schema";
import { ProgramsService } from "$services";
import type { z } from "@hono/zod-openapi";
import { GraphQLError } from "graphql/error";

export const programResolvers = {
  Query: {
    major: async (_: unknown, args: { query?: unknown }, { db }: GraphQLContext) => {
      const parsedArgs = majorRequirementsQuerySchema.parse(args?.query);
      const service = new ProgramsService(db);
      const res = await service.getMajorRequirements(parsedArgs);
      if (!res)
        throw new GraphQLError(`Major ${parsedArgs.programId} not found`, {
          extensions: { code: "NOT_FOUND" },
        });
      return res;
    },
    minor: async (_: unknown, args: { query?: unknown }, { db }: GraphQLContext) => {
      const parsedArgs = minorRequirementsQuerySchema.parse(args?.query);
      const service = new ProgramsService(db);
      const res = await service.getMinorRequirements(parsedArgs);
      if (!res)
        throw new GraphQLError(`Minor ${parsedArgs.programId} not found`, {
          extensions: { code: "NOT_FOUND" },
        });
      return res;
    },
    specialization: async (_: unknown, args: { query?: unknown }, { db }: GraphQLContext) => {
      const parsedArgs = specializationRequirementsQuerySchema.parse(args?.query);
      const service = new ProgramsService(db);
      const res = await service.getSpecializationRequirements(parsedArgs);
      if (!res)
        throw new GraphQLError(`Specialization ${parsedArgs.programId} not found`, {
          extensions: { code: "NOT_FOUND" },
        });
      return res;
    },
    majors: async (_: unknown, args: { query?: unknown }, { db }: GraphQLContext) => {
      const parsedArgs = majorsQuerySchema.parse(args?.query);
      const service = new ProgramsService(db);
      const res = await service.getMajors(parsedArgs);
      if (!res)
        throw new GraphQLError("Major data not found", {
          extensions: { code: "NOT_FOUND" },
        });
      return res;
    },
    minors: async (_: unknown, args: { query?: unknown }, { db }: GraphQLContext) => {
      const parsedArgs = minorsQuerySchema.parse(args?.query);
      const service = new ProgramsService(db);
      const res = await service.getMinors(parsedArgs);
      if (!res)
        throw new GraphQLError("Minor data not found", {
          extensions: { code: "NOT_FOUND" },
        });
      return res;
    },
    specializations: async (_: unknown, args: { query?: unknown }, { db }: GraphQLContext) => {
      const parsedArgs = specializationsQuerySchema.parse(args?.query);
      const service = new ProgramsService(db);
      const res = await service.getSpecializations(parsedArgs);
      if (!res)
        throw new GraphQLError("Specializations data not found", {
          extensions: { code: "NOT_FOUND" },
        });
      return res;
    },
    ugradRequirements: async (_: unknown, args: { query?: unknown }, { db }: GraphQLContext) => {
      const parsedArgs = ugradRequirementsQuerySchema.parse(args?.query);
      const service = new ProgramsService(db);
      const res = await service.getUgradRequirements(parsedArgs);
      if (!res)
        throw new GraphQLError("Undergraduate requirements block not found", {
          extensions: { code: "NOT_FOUND" },
        });
      return res;
    },
  },
  ProgramRequirement: {
    // x outside this typehint is malformed data; meh
    __resolveType: (x: {
      requirementType: z.infer<typeof programRequirementSchema>["requirementType"];
    }) => {
      switch (x?.requirementType) {
        case "Course":
          return "ProgramCourseRequirement";
        case "Unit":
          return "ProgramUnitRequirement";
        case "Group":
          return "ProgramGroupRequirement";
        case "Marker":
          return "ProgramMarkerRequirement";
      }
    },
  },
};
