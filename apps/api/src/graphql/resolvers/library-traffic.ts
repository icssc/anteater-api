import type { GraphQLContext } from "$graphql/graphql-context";
import { libraryTrafficQuerySchema } from "$schema";
import { LibraryTrafficService } from "$services";

export const libraryTrafficResolvers = {
  Query: {
    libraryTraffic: async (_: unknown, args: { query: unknown }, { db }: GraphQLContext) => {
      const service = new LibraryTrafficService(db);
      return await service.getLibraryTraffic(libraryTrafficQuerySchema.parse(args.query));
    },
  },
};
