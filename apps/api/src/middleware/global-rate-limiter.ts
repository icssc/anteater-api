import type { ErrorSchema } from "$schema";
import type { Bindings } from "$types/bindings";
import type { KeyData } from "$types/keys";
import { DurableObjectStore } from "@hono-rate-limiter/cloudflare";
import type { Context } from "hono";
import { rateLimiter } from "hono-rate-limiter";
import { createMiddleware } from "hono/factory";

const MILLISECONDS_PER_HOUR = 60 * 60 * 1_000;
const REQUESTS_PER_HOUR = 25_000;

export const globalRateLimiter = createMiddleware((c: Context<{ Bindings: Bindings }>, next) =>
  rateLimiter<{ Bindings: Bindings }>({
    windowMs: MILLISECONDS_PER_HOUR,
    limit: async (c) => {
      const key = c.req.header("authorization");
      return key
        ? await c.env.API_KEYS.get<KeyData>(key).then(
            (data) => data?.rateLimitOverride ?? REQUESTS_PER_HOUR,
          )
        : REQUESTS_PER_HOUR;
    },
    store: new DurableObjectStore({ namespace: c.env.RATE_LIMITER }),
    keyGenerator: (c) => c.req.header("authorization") ?? "",
    handler: (c) =>
      c.json<ErrorSchema>(
        { ok: false, message: "Too many requests, please try again later." },
        429,
      ),
  })(c, next),
);
