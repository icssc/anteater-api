import { errorSchema } from "$schema";
import type { z } from "@hono/zod-openapi";

export const response200 = <T extends z.ZodTypeAny>(successSchema: T) =>
  ({
    content: {
      "application/json": { schema: successSchema },
    },
    description: "Successful operation",
  }) as const;

export const response404 = (description: string) =>
  ({
    content: { "application/json": { schema: errorSchema } },
    description: description,
  }) as const;

export const response422 = () =>
  ({
    content: { "application/json": { schema: errorSchema } },
    description: "Parameters failed validation",
  }) as const;

export const response500 = () =>
  ({
    content: { "application/json": { schema: errorSchema } },
    description: "Server error occurred",
  }) as const;
