import type { GraphQLContext } from "$graphql/graphql-context";
import {
  diningEventsQuerySchema,
  restaurantTodayQuerySchema,
  restaurantsQuerySchema,
} from "$schema";
import { DiningService } from "$services";
import { GraphQLError } from "graphql/error";

export const diningResolvers = {
  Query: {
    diningEvents: async (_: unknown, args: { query: unknown }, { db }: GraphQLContext) => {
      const service = new DiningService(db);
      return await service.getUpcomingEvents(diningEventsQuerySchema.parse(args.query ?? {}));
    },
    diningDish: async (_: unknown, { id }: { id: string }, { db }: GraphQLContext) => {
      const service = new DiningService(db);
      const dish = await service.getDishById({ id });
      if (!dish) {
        throw new GraphQLError(`Dish '${id}' not found`, {
          extensions: { code: "NOT_FOUND" },
        });
      }
      return dish;
    },
    batchDiningDishes: async (_: unknown, { ids }: { ids: string[] }, { db }: GraphQLContext) => {
      const service = new DiningService(db);
      return await service.batchGetDishes(ids);
    },
    diningDateRange: async (_: unknown, _args: unknown, { db }: GraphQLContext) => {
      const service = new DiningService(db);
      return await service.getDateRange();
    },
    getRestaurants: async (_: unknown, args: { query: unknown }, { db }: GraphQLContext) => {
      const service = new DiningService(db);
      return await service.getRestaurants(restaurantsQuerySchema.parse(args.query ?? {}));
    },
    getRestaurantToday: async (_: unknown, args: { query: unknown }, { db }: GraphQLContext) => {
      const service = new DiningService(db);
      const data = await service.getRestaurantToday(restaurantTodayQuerySchema.parse(args.query));
      if (!data) {
        throw new GraphQLError("Restaurant not found", {
          extensions: { code: "NOT_FOUND" },
        });
      }
      return data;
    },
  },
};
