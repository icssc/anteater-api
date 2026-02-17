import { errorSchema } from "$schema";
import type { z } from "@hono/zod-openapi";

export function response200<T extends z.ZodTypeAny>(successSchema: T) {
  return {
    content: { "application/json": { schema: successSchema } },
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
