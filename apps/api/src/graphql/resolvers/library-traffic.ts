import type { GraphQLContext } from "$graphql/graphql-context";
import { libraryTrafficQuerySchema, libraryTrafficSchema } from "$schema";
import { LibraryTrafficService } from "$services";
import { GraphQLError } from "graphql/error";

export const libraryTrafficResolvers = {
  Query: {
    libraryTraffic: async (_: unknown, args: { query: unknown }, { db }: GraphQLContext) => {
      const service = new LibraryTrafficService(db);
      const input = libraryTrafficQuerySchema.parse(args.query);
      const res = await service.getLibraryTraffic(input);

      if (res.length === 0) {
        throw new GraphQLError("Library traffic data not found: check for typos in query", {
          extensions: { code: "BAD_REQUEST" },
        });
      }

      return libraryTrafficSchema.parse(res);
    },
  },
};
