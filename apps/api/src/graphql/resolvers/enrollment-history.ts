import type { GraphQLContext } from "$graphql/graphql-context";
import {
  enrollmentHistoryGranularQuerySchema,
  enrollmentHistoryGranularSchema,
  enrollmentHistoryQuerySchema,
  enrollmentHistorySchema,
} from "$schema";
import { EnrollmentHistoryService } from "$services";

export const enrollmentHistoryResolvers = {
  Query: {
    enrollmentHistory: async (_: unknown, args: { query: unknown }, { db }: GraphQLContext) => {
      const service = new EnrollmentHistoryService(db);
      return enrollmentHistorySchema
        .array()
        .parse(await service.getEnrollmentHistory(enrollmentHistoryQuerySchema.parse(args.query)));
    },
    enrollmentHistoryGranular: async (
      _: unknown,
      args: { query: unknown },
      { db }: GraphQLContext,
    ) => {
      const service = new EnrollmentHistoryService(db);
      return enrollmentHistoryGranularSchema
        .array()
        .parse(
          await service.getEnrollmentHistoryGranular(
            enrollmentHistoryGranularQuerySchema.parse(args.query),
          ),
        );
    },
  },
};
