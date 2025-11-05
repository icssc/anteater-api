import type { GraphQLContext } from "$graphql/graphql-context";
import { sampleProgramsQuerySchema } from "$schema";
import { ProgramsService } from "$services";
import { GraphQLError } from "graphql/error";

export const catalogueResolvers = {
  Query: {
    samplePrograms: async (_: unknown, args: { query?: unknown }, { db }: GraphQLContext) => {
      const parsedArgs = sampleProgramsQuerySchema.parse(args?.query);
      const service = new ProgramsService(db);
      const res = await service.getSamplePrograms(parsedArgs);
      if (!res)
        throw new GraphQLError("No data for a sample program by that ID", {
          extensions: { code: "NOT_FOUND" },
        });
      return res;
    },
  },
};
