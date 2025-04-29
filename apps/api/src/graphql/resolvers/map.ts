import type { GraphQLContext } from "$graphql/graphql-context";
import { mapQuerySchema } from "$schema";
import { MapService } from "$services";
import { GraphQLError } from "graphql/error";

export const mapResolvers = {
  Query: {
    major: async (_: unknown, args: { query?: unknown }, { db }: GraphQLContext) => {
      const parsedArgs = mapQuerySchema.parse(args?.query);
      const service = new MapService(db);
      const res = await service.getLocations(parsedArgs);
      if (!res)
        throw new GraphQLError(`Location id ${parsedArgs.id} not found`, {
          extensions: { code: "NOT_FOUND" },
        });
      return res;
    },
  },
};
