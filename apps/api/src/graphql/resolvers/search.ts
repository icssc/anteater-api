import type { GraphQLContext } from "$graphql/graphql-context";
import { searchQuerySchema } from "$schema";
import { CoursesService, InstructorsService, SearchService } from "$services";

export const searchResolvers = {
  Query: {
    search: async (_: unknown, args: { query: unknown }, { db }: GraphQLContext) => {
      const service = new SearchService(db, new CoursesService(db), new InstructorsService(db));
      return await service.doSearch(searchQuerySchema.parse(args.query));
    },
  },
  CourseOrInstructor: {
    __resolveType: (x: Record<string, unknown>) => ("id" in x ? "Course" : "Instructor"),
  },
};
