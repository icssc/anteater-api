import type { GraphQLContext } from "$graphql/graphql-context";
import {
  websocDepartmentsQuerySchema,
  websocDepartmentsResponseSchema,
  websocQuerySchema,
} from "$schema";
import { WebsocService } from "$services";

export const websocResolvers = {
  Query: {
    websoc: async (_: unknown, args: { query: unknown }, { db }: GraphQLContext) => {
      const service = new WebsocService(db);
      return await service.getWebsocResponse(websocQuerySchema.parse(args.query));
    },
    terms: async (_: unknown, __: unknown, { db }: GraphQLContext) => {
      const service = new WebsocService(db);
      return await service.getAllTerms();
    },
    websocDepartments: async (_: unknown, args: { query: unknown }, { db }: GraphQLContext) => {
      const service = new WebsocService(db);
      return websocDepartmentsResponseSchema.parse(
        await service.getDepartments(websocDepartmentsQuerySchema.parse(args.query)),
      );
    },
  },
};
