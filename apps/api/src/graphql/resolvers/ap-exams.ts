import type { GraphQLContext } from "$graphql/graphql-context";
import { apExamsQuerySchema } from "$schema";
import { APExamsService } from "$services";
import { GraphQLError } from "graphql/error";

export const apExamResolvers = {
  Query: {
    apExams: async (_: unknown, args: { query?: unknown }, { db }: GraphQLContext) => {
      const parsedArgs = apExamsQuerySchema.parse(args?.query ?? {});
      const service = new APExamsService(db);
      const res = await service.getAPExams(parsedArgs);
      if (args?.query && (parsedArgs.fullName || parsedArgs.catalogueName) && !res.length)
        throw new GraphQLError("Can't find any AP Exams; is your id correct?", {
          extensions: { code: "NOT_FOUND" },
        });
      return res;
    },
  },
};
