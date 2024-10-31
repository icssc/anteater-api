import type { GraphQLContext } from "$graphql/graphql-context";
import { accessController } from "$middleware";
import { searchQuerySchema } from "$schema";
import { CoursesService, InstructorsService, SearchService } from "$services";

export const searchResolvers = {
  Query: {
    search: async (_: unknown, args: { query: unknown }, ctx: GraphQLContext) => {
      await accessController("FUZZY_SEARCH")(ctx.honoContext, async () => {});
      const service = new SearchService(
        ctx.db,
        new CoursesService(ctx.db),
        new InstructorsService(ctx.db),
      );
      return await service.doSearch(searchQuerySchema.parse(args.query));
    },
  },
  CourseOrInstructor: {
    __resolveType: (x: Record<string, unknown>) => ("id" in x ? "Course" : "Instructor"),
  },
};
