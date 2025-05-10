import type { GraphQLContext } from "$graphql/graphql-context";
import { libraryTrafficQuerySchema, libraryTrafficSchema } from "$schema";
import { LibraryTrafficService } from "$services";

export const libraryTrafficResolvers = {
  Query: {
    libraryTraffic: async (_: unknown, args: { query: unknown }, { db }: GraphQLContext) => {
      const service = new LibraryTrafficService(db);
      const input = libraryTrafficQuerySchema.parse(args.query);
      const rows = await service.getLibraryTraffic(input);
      return libraryTrafficSchema.parse(rows);
    },
  },
};
