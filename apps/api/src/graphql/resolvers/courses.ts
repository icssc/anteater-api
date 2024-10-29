import type { GraphQLContext } from "$graphql/graphql-context";
import { coursesQuerySchema } from "$schema";
import { CoursesService } from "$services";
import { GraphQLError } from "graphql/error";

export const coursesResolvers = {
  Query: {
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
  },
};
