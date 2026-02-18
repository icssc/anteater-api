import type { GraphQLContext } from "$graphql/graphql-context.ts";
import { restaurantsQuerySchema } from "$schema";
import { DiningService } from "$services";

export const diningResolvers = {
  Query: {
    getRestaurants: async (_: unknown, args: { query: unknown }, { db }: GraphQLContext) => {
      const service = new DiningService(db);
      return await service.getRestaurants(restaurantsQuerySchema.parse(args));
    },
  },
};
