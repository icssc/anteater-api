import type { GraphQLContext } from "$graphql/graphql-context";
import { enrollmentChangesQuerySchema } from "$schema";
import { EnrollmentChangesService } from "$services";

export const enrollmentChangesResolvers = {
  Query: {
    enrollmentChanges: async (
      _: unknown,
      args: { query: unknown },
      { db }: GraphQLContext,
    ) => {
      const service = new EnrollmentChangesService(db);
      return await service.getEnrollmentChanges(
        enrollmentChangesQuerySchema.parse(args.query)
      );
    },
  },
};