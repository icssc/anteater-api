import type { GraphQLContext } from "$graphql/graphql-context";
import { larcQuerySchema } from "../../schema/larc.ts";
import { LarcService } from "../../services/larc.ts";

export const larcResolvers = {
  Query: {
    larc: async (_: unknown, args: { query: unknown }, { db }: GraphQLContext) => {
      const service = new LarcService(db);
      return await service.getLarcSections(larcQuerySchema.parse(args.query));
    },
    allLarc: async (_: unknown, __: unknown, { db }: GraphQLContext) => {
      const service = new LarcService(db);
      return await service.getAllLarcSections();
    },
  },
};
