import { z } from "@hono/zod-openapi";

export const errorSchema = z.object({
  ok: z.literal<boolean>(false).openapi({}),
  message: z.string().openapi({ description: "Details on why the request may have failed" }),
});

export type ErrorSchema = z.infer<typeof errorSchema>;
