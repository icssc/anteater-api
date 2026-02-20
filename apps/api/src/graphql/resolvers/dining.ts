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
    diningDates: async (_: unknown, _args: unknown, { db }: GraphQLContext) => {
      const service = new DiningService(db);
      return await service.getPickableDates();
    },
    getRestaurants: async (_: unknown, args: { query: unknown }, { db }: GraphQLContext) => {
      const service = new DiningService(db);
      return await service.getRestaurants(restaurantsQuerySchema.parse(args));
    },
    getRestaurantToday: async (_: unknown, args: { query: unknown }, { db }: GraphQLContext) => {
      const service = new DiningService(db);
      return await service.getRestaurantToday(restaurantTodayQuerySchema.parse(args.query));
    },
  },
};
