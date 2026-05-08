import type { GraphQLContext } from "$graphql/graphql-context";
import { courseMaterialsQuerySchema } from "$schema";
import { CourseMaterialsService } from "$services";

export const courseMaterialsResolvers = {
  Query: {
    samplePrograms: async (_: unknown, args: { query?: unknown }, { db }: GraphQLContext) => {
      const service = new CourseMaterialsService(db);
      return await service.getCourseMaterials(courseMaterialsQuerySchema.parse(args.query));
    },
  },
};
