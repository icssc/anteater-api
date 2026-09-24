import { Repeater } from "graphql-yoga";
import type { z } from "zod";
import type { GraphQLContext } from "$graphql/graphql-context";
import {
  syllabiQuerySchema,
  syllabiSchema,
  websocDepartmentsQuerySchema,
  websocDepartmentsResponseSchema,
  websocQuerySchema,
  websocSchoolSchema,
} from "$schema";
import { WebsocService } from "$services";

export const websocResolvers = {
  Query: {
    websoc: (_: unknown, args: { query: unknown }, { db }: GraphQLContext) => {
      const schools = new Repeater<z.infer<typeof websocSchoolSchema>>(async (push, stop) => {
        const service = new WebsocService(db);
        const readableStream = await service.getWebsocResponse(websocQuerySchema.parse(args.query));
        const reader = readableStream.getReader();
        console.log("called repeater");

        try {
          let c = 1;
          while (true) {
            const { done, value } = await reader.read();
            if (done) return;
            const result = websocSchoolSchema.safeParse(
              JSON.parse(new TextDecoder().decode(value)),
            );
            if (!result.success) {
              console.log("error:", result.error.issues);
            } else {
              console.log("pushing school", c);
              c++;
              // console.log(websocSchoolSchema.parse(json))
              await push(result.data);
            }
          }
        } finally {
          try {
            await reader.cancel();
          } finally {
            console.log("finished");
            reader.releaseLock();
            stop();
          }
        }
      });
      return {
        schools,
      };
      // const service = new WebsocService(db);
      // return await service.getWebsocResponse(websocQuerySchema.parse(args.query));
    },
    terms: async (_: unknown, __: unknown, { db }: GraphQLContext) => {
      console.log("hi");
      const service = new WebsocService(db);
      return await service.getAllTerms();
    },
    websocDepartments: async (_: unknown, args: { query: unknown }, { db }: GraphQLContext) => {
      const service = new WebsocService(db);
      return websocDepartmentsResponseSchema.parse(
        await service.getDepartments(websocDepartmentsQuerySchema.parse(args.query)),
      );
    },
    syllabi: async (_: unknown, args: { query: unknown }, { db }: GraphQLContext) => {
      const service = new WebsocService(db);
      return syllabiSchema
        .array()
        .parse(await service.getSyllabi(syllabiQuerySchema.parse(args.query)));
    },
  },
};
