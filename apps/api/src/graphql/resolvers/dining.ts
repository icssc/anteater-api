import type { GraphQLContext } from "$graphql/graphql-context";
import {
  diningDatesResponseSchema,
  diningEventsQuerySchema,
  diningEventsResponseSchema,
  dishSchema,
} from "$schema";
import { DiningService } from "$services";
import { GraphQLError } from "graphql/error";

export const diningResolvers = {
  Query: {
    diningEvents: async (_: unknown, args: { query: unknown }, { db }: GraphQLContext) => {
      const service = new DiningService(db);
      const input = diningEventsQuerySchema.parse(args.query ?? {});
      return diningEventsResponseSchema.parse(await service.getUpcomingEvents(input));
    },

    diningDish: async (_: unknown, { id }: { id: string }, { db }: GraphQLContext) => {
      const service = new DiningService(db);
      const dish = await service.getDishById({ id });

      if (!dish) {
        throw new GraphQLError(`Dish '${id}' not found`, {
          extensions: { code: "NOT_FOUND" },
        });
      }

      return dishSchema.parse(dish);
    },

    diningDates: async (_: unknown, _args: unknown, { db }: GraphQLContext) => {
      const service = new DiningService(db);
      return diningDatesResponseSchema.parse(await service.getPickableDates());
    },
  },
};
