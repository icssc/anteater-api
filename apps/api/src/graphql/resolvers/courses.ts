import type { GraphQLContext } from "$graphql/graphql-context";
import { coursesByCursorQuerySchema, coursesQuerySchema } from "$schema";
import { CoursesService } from "$services";
import { GraphQLError } from "graphql/error";

export const coursesResolvers = {
  Query: {
    batchCourses: async (_: unknown, { ids }: { ids: string[] }, { db }: GraphQLContext) => {
      const service = new CoursesService(db);
      return await service.batchGetCourses(ids);
    },
    course: async (_: unknown, { id }: { id: string }, { db }: GraphQLContext) => {
      const service = new CoursesService(db);
      const res = await service.getCourseById(id);
      if (!res)
        throw new GraphQLError(`Course '${id}' not found`, { extensions: { code: "NOT_FOUND" } });
      return res;
    },
    courses: async (_: unknown, args: { query: unknown }, { db }: GraphQLContext) => {
      const service = new CoursesService(db);
      return await service.getCourses(coursesQuerySchema.parse(args.query));
    },
    coursesByCursor: async (_: unknown, args: { query: unknown }, { db }: GraphQLContext) => {
      const service = new CoursesService(db);
      const { items, nextCursor } = await service.getCoursesByCursor(
        coursesByCursorQuerySchema.parse(args.query),
      );
      return {
        items,
        nextCursor,
      };
    },
  },
};
