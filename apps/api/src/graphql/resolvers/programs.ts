import type { GraphQLContext } from "$graphql/graphql-context";
import {
  majorRequirementsQuerySchema,
  minorRequirementsQuerySchema,
  specializationRequirementsQuerySchema,
} from "$schema";
import { ProgramsService } from "$services";
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
    listMajors: async (_: unknown, args: unknown, { db }: GraphQLContext) => {
      const service = new ProgramsService(db);
      const res = await service.getMajors();
      if (!res)
        throw new GraphQLError("Major data not found", {
          extensions: { code: "NOT_FOUND" },
        });
      return res;
    },
    listMinors: async (_: unknown, args: unknown, { db }: GraphQLContext) => {
      const service = new ProgramsService(db);
      const res = await service.getMinors();
      if (!res)
        throw new GraphQLError("Minor data not found", {
          extensions: { code: "NOT_FOUND" },
        });
      return res;
    },
    listSpecializations: async (_: unknown, args: unknown, { db }: GraphQLContext) => {
      const service = new ProgramsService(db);
      const res = await service.getSpecializations();
      if (!res)
        throw new GraphQLError("Specializations data not found", {
          extensions: { code: "NOT_FOUND" },
        });
      return res;
    },
  },
  ProgramRequirement: {
    // x outside this typehint is malformed data; meh
    __resolveType: (x: { requirementType: "Course" | "Unit" | "Group" }) => {
      switch (x?.requirementType) {
        case "Course":
          return "ProgramCourseRequirement";
        case "Unit":
          return "ProgramUnitRequirement";
        case "Group":
          return "ProgramGroupRequirement";
      }
    },
  },
};
