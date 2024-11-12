import type { GraphQLContext } from "$graphql/graphql-context";
import { studyRoomsQuerySchema } from "$schema";
import { StudyRoomsService } from "$services";
import { GraphQLError } from "graphql/error";

export const studyRoomsResolvers = {
  Query: {
    studyRoom: async (_: unknown, { id }: { id: string }, { db }: GraphQLContext) => {
      const service = new StudyRoomsService(db);
      const res = await service.getStudyRoomById(id);
      if (!res)
        throw new GraphQLError(`Study room '${id}' not found`, {
          extensions: { code: "NOT_FOUND" },
        });
      return res;
    },
    studyRooms: async (_: unknown, args: { query: unknown }, { db }: GraphQLContext) => {
      const service = new StudyRoomsService(db);
      const validatedQuery = studyRoomsQuerySchema.parse(args.query); // Validate and parse the input
      return await service.getStudyRooms(validatedQuery);
    },
    allStudyRooms: async (_: unknown, __: unknown, { db }: GraphQLContext) => {
      const service = new StudyRoomsService(db);
      return await service.getAllStudyRooms();
    },
  },
};
