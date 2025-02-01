import { z } from "@hono/zod-openapi";

export const responseSchema = <T extends z.ZodType>(data: T) =>
  z.object({
    ok: z.literal<boolean>(true).openapi({}),
    data: data.openapi({ description: "The data that was requested" }),
  });

export const cursorResponseSchema = <T extends z.ZodType>(data: T) =>
  z.object({
    ok: z.literal<boolean>(true).openapi({}),
    data: z.object({
      items: data.openapi({ description: "The list of requested items" }),
      nextCursor: z
        .string()
        .nullable()
        .openapi({ description: "Cursor for the next page, or null if there are no more results" }),
    }),
  });
