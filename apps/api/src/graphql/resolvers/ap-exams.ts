import type { GraphQLContext } from "$graphql/graphql-context";
import { apExamsService } from "$services";

export const apExamResolvers = {
  Query: {
    apExams: async (_: unknown, _query: unknown, { db }: GraphQLContext) => {
      const service = new apExamsService(db);
      return service.getAPExams();
    },
  },
};
