import type { GraphQLContext } from "$graphql/graphql-context";
import { enrollmentChangesGraphQLQuerySchema } from "$schema";
import { EnrollmentChangesService } from "$services";

export const enrollmentChangesResolvers = {
  Query: {
    enrollmentChanges: async (_: unknown, args: { query?: unknown }, { db }: GraphQLContext) => {
      // on graphql, we get the REST query and body args together...
      const parsedArgs = enrollmentChangesGraphQLQuerySchema.parse(args?.query);

      const service = new EnrollmentChangesService(db);
      // ...but that's fine
      return await service.getEnrollmentChanges(parsedArgs, parsedArgs);
    },
  },
};
