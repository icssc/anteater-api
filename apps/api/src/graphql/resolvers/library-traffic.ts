import type { GraphQLContext } from "$graphql/graphql-context";
import { LibraryTrafficService } from "$services";

export const libraryTrafficResolvers = {
  Query: {
    latestLibraryTraffic: async (_: unknown, args: { query?: unknown }, { db }: GraphQLContext) => {
      const service = new LibraryTrafficService(db);
      const res = await service.getLatestTrafficData();

      return res;
    },
  },
};
