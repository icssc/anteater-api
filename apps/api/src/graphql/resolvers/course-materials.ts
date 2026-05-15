import type { GraphQLContext } from "$graphql/graphql-context";
import { courseMaterialsQuerySchema } from "$schema";
import { CourseMaterialsService } from "$services";

const requirementMap: Record<string, string> = {
  Required: "Required",
  Recommended: "Recommended",
  GoToClassFirst: "Go to Class First",
};

export const courseMaterialsResolvers = {
  Query: {
    getCourseMaterials: async (_: unknown, args: { query?: any }, { db }: GraphQLContext) => {
      const service = new CourseMaterialsService(db);
      const queryInput = { ...args.query };
      if (queryInput.requirement && requirementMap[queryInput.requirement]) {
        queryInput.requirement = requirementMap[queryInput.requirement];
      }
      const fixedInput = courseMaterialsQuerySchema.parse(queryInput);
      return await service.getCourseMaterials(fixedInput);
    },
  },
};
