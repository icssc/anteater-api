import { errorSchema } from "$schema";
import { z } from "@hono/zod-openapi";

export function responseSchema<T extends z.ZodType>(data: T, isCursor = false) {
  const dataSchema = isCursor
    ? z.object({
        items: data.openapi({ description: "The list of requested items" }),
        nextCursor: z.string().nullable().openapi({
          description: "Cursor pointing to the next page. Null if there are no more results",
        }),
      })
    : data.openapi({ description: "The data that was requested" });

  return z.object({
    ok: z.literal<boolean>(true).openapi({}),
    data: dataSchema,
  });
}

export function response200<T extends z.ZodTypeAny>(data: T, isCursor = false) {
  return {
    content: { "application/json": { schema: responseSchema(data, isCursor) } },
    description: "Successful operation",
  } as const;
}
export function response404(description: string) {
  return {
    content: { "application/json": { schema: errorSchema } },
    description: description,
  } as const;
}

export function response422() {
  return {
    content: { "application/json": { schema: errorSchema } },
    description: "Parameters failed validation",
  } as const;
}

export function response500() {
  return {
    content: { "application/json": { schema: errorSchema } },
    description: "Server error occurred",
  } as const;
}
