import { GraphQLError } from "graphql/error";
import type { GraphQLContext } from "$graphql/graphql-context";
import {
  libraryTrafficHistoryAggregatedQuerySchema,
  libraryTrafficHistoryAggregatedSchema,
  libraryTrafficHistoryPatternQuerySchema,
  libraryTrafficHistoryPatternSchema,
  libraryTrafficHistoryRawQuerySchema,
  libraryTrafficHistoryRawSchema,
  libraryTrafficQuerySchema,
  libraryTrafficSchema,
} from "$schema";
import { LibraryTrafficService } from "$services";

export const libraryTrafficResolvers = {
  Query: {
    libraryTraffic: async (_: unknown, args: { query: unknown }, { db }: GraphQLContext) => {
      const service = new LibraryTrafficService(db);
      const input = libraryTrafficQuerySchema.parse(args.query ?? {});
      const res = await service.getLibraryTraffic(input);

      if (res.length === 0) {
        throw new GraphQLError("Library traffic data not found: check for typos in query", {
          extensions: { code: "BAD_REQUEST" },
        });
      }

      return libraryTrafficSchema.parse(res);
    },

    libraryTrafficHistory: async (_: unknown, args: { query: unknown }, { db }: GraphQLContext) => {
      const service = new LibraryTrafficService(db);
      const input = libraryTrafficHistoryRawQuerySchema.parse(args.query);
      const { items, nextCursor } = await service.getLibraryTrafficHistoryRaw(input);

      if (items.length === 0) {
        throw new GraphQLError("Library traffic history not found: check for typos in query", {
          extensions: { code: "BAD_REQUEST" },
        });
      }

      return { items: libraryTrafficHistoryRawSchema.parse(items), nextCursor };
    },

    libraryTrafficHistoryAggregated: async (
      _: unknown,
      args: { query: unknown },
      { db }: GraphQLContext,
    ) => {
      const service = new LibraryTrafficService(db);
      const input = libraryTrafficHistoryAggregatedQuerySchema.parse(args.query);
      const res = await service.getLibraryTrafficHistoryAggregated(input);

      if (res.length === 0) {
        throw new GraphQLError("Library traffic history not found: check for typos in query", {
          extensions: { code: "BAD_REQUEST" },
        });
      }

      return libraryTrafficHistoryAggregatedSchema.parse(res);
    },

    libraryTrafficHistoryPattern: async (
      _: unknown,
      args: { query: unknown },
      { db }: GraphQLContext,
    ) => {
      const service = new LibraryTrafficService(db);
      const input = libraryTrafficHistoryPatternQuerySchema.parse(args.query ?? {});
      const res = await service.getLibraryTrafficHistoryPattern(input);

      if (res.length === 0) {
        throw new GraphQLError("Library traffic history not found: check for typos in query", {
          extensions: { code: "BAD_REQUEST" },
        });
      }

      return libraryTrafficHistoryPatternSchema.parse(res);
    },
  },
};
