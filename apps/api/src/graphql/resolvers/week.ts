import { GraphQLError } from "graphql/error";
import type { GraphQLContext } from "$graphql/graphql-context";
import { weekQuerySchema } from "$schema";
import { WeekService } from "$services";

export const weekResolvers = {
	Query: {
		week: async (_: unknown, args: unknown, { db }: GraphQLContext) => {
			const service = new WeekService(db);
			const res = await service.getWeekData(weekQuerySchema.parse(args));
			if (!res)
				throw new GraphQLError(
					"Something unexpected happened. Please try again later.",
					{
						extensions: { code: "INTERNAL_SERVER_ERROR" },
					},
				);
			return res;
		},
	},
};
