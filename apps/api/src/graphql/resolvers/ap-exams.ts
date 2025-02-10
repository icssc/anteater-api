import type { GraphQLContext } from "$graphql/graphql-context";
import { apExamsQuerySchema } from "$schema";
import { apExamsService } from "$services";

export const apExamResolvers = {
  Query: {
    apExams: async (_: unknown, args: { query?: unknown }, { db }: GraphQLContext) => {
      const parsedArgs = apExamsQuerySchema.parse(args?.query ?? {});
      const service = new apExamsService(db);
      return await service.getAPExams(parsedArgs);
    },
  },
};
