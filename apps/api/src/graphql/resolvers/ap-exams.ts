import type { GraphQLContext } from "$graphql/graphql-context";
import { apExamsQuerySchema } from "$schema";
import { apExamsService } from "$services";
import { GraphQLError } from "graphql/error";

export const apExamResolvers = {
  Query: {
    apExams: async (_: unknown, args: { query?: unknown }, { db }: GraphQLContext) => {
      const parsedArgs = apExamsQuerySchema.parse(args?.query ?? {});
      const service = new apExamsService(db);
      const res = await service.getAPExams(parsedArgs);
      if (args?.query && !res.length)
        throw new GraphQLError("AP Exam mapping not found", {
          extensions: { code: "NOT_FOUND" },
        });
      return res;
    },
  },
};
