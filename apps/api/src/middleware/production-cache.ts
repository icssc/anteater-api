import type { Bindings } from "$types/bindings";
import { cache } from "hono/cache";
import { createMiddleware } from "hono/factory";

export const productionCache = (cacheOptions: Parameters<typeof cache>[0]) =>
  createMiddleware<{ Bindings: Bindings }>(async (c, next) =>
    c.env.CF_ENV === "prod" ? cache(cacheOptions)(c, next) : await next(),
  );
