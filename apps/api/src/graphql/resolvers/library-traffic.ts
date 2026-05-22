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
      const { items, nextCursor } = await service.getLibraryTrafficHistoryRaw(
        libraryTrafficHistoryRawQuerySchema.parse(args.query ?? {}),
      );
      return { items: libraryTrafficHistoryRawSchema.parse(items), nextCursor };
    },

    libraryTrafficHistoryAggregated: async (
      _: unknown,
      args: { query: unknown },
      { db }: GraphQLContext,
    ) => {
      const service = new LibraryTrafficService(db);
      return libraryTrafficHistoryAggregatedSchema.parse(
        await service.getLibraryTrafficHistoryAggregated(
          libraryTrafficHistoryAggregatedQuerySchema.parse(args.query ?? {}),
        ),
      );
    },

    libraryTrafficHistoryPattern: async (
      _: unknown,
      args: { query: unknown },
      { db }: GraphQLContext,
    ) => {
      const service = new LibraryTrafficService(db);
      return libraryTrafficHistoryPatternSchema.parse(
        await service.getLibraryTrafficHistoryPattern(
          libraryTrafficHistoryPatternQuerySchema.parse(args.query ?? {}),
        ),
      );
    },
  },
};
