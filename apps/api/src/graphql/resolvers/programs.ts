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
      const res = await service.getProgramRequirements("major", parsedArgs);
      if (!res)
        throw new GraphQLError(`Major ${parsedArgs.programId} not found`, {
          extensions: { code: "NOT_FOUND" },
        });
      return res;
    },
    minor: async (_: unknown, args: { query?: unknown }, { db }: GraphQLContext) => {
      const parsedArgs = minorRequirementsQuerySchema.parse(args?.query);
      const service = new ProgramsService(db);
      const res = await service.getProgramRequirements("minor", parsedArgs);
      if (!res)
        throw new GraphQLError(`Minor ${parsedArgs.programId} not found`, {
          extensions: { code: "NOT_FOUND" },
        });
      return res;
    },
    specialization: async (_: unknown, args: { query?: unknown }, { db }: GraphQLContext) => {
      const parsedArgs = specializationRequirementsQuerySchema.parse(args?.query);
      const service = new ProgramsService(db);
      const res = await service.getProgramRequirements("specialization", parsedArgs);
      if (!res)
        throw new GraphQLError(`Specialization ${parsedArgs.programId} not found`, {
          extensions: { code: "NOT_FOUND" },
        });
      return res;
    },
  },
  ProgramRequirement: {
    __resolveType: (x: Record<string, unknown>) => {
      switch (x?.requirementType) {
        case "Course":
          return "ProgramCourseRequirement";
        case "Unit":
          return "ProgramUnitRequirement";
        case "Group":
          return "ProgramGroupRequirement";
        default:
          // you deserve what's coming for you
          return "<unknown requirement type>";
      }
    },
  },
};
