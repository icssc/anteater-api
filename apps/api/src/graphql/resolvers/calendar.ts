import { GraphQLError } from "graphql/error";
import type { GraphQLContext } from "$graphql/graphql-context";
import { calendarQuerySchema } from "$schema";
import { CalendarService } from "$services";

export const calendarResolvers = {
  Query: {
    calendarTerm: async (_: unknown, args: unknown, { db }: GraphQLContext) => {
      const parsedArgs = calendarQuerySchema.parse(args);
      const service = new CalendarService(db);
      const res = await service.getCalendarTerm(parsedArgs);
      if (!res)
        throw new GraphQLError(`Term ${parsedArgs.year} ${parsedArgs.quarter} not found`, {
          extensions: { code: "NOT_FOUND" },
        });
      return res;
    },
    allCalendarTerms: async (_: unknown, __: unknown, { db }: GraphQLContext) => {
      const service = new CalendarService(db);
      return await service.getAllCalendarTerms();
    },
  },
};
