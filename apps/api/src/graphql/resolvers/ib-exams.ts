import { GraphQLError } from "graphql/error";
import type { GraphQLContext } from "$graphql/graphql-context";
import { ibExamsQuerySchema } from "$schema";
import { IBExamsService } from "$services";

export const ibExamResolvers = {
  Query: {
    ibExams: async (_: unknown, args: { query?: unknown }, { db }: GraphQLContext) => {
      const parsedArgs = ibExamsQuerySchema.parse(args?.query ?? {});
      const service = new IBExamsService(db);
      const res = await service.getIBExams(parsedArgs);
      if (args?.query && (parsedArgs.fullName || parsedArgs.catalogueName) && !res.length)
        throw new GraphQLError("Can't find any IB Exams; is your id correct?", {
          extensions: { code: "NOT_FOUND" },
        });
      return res;
    },
  },
};
