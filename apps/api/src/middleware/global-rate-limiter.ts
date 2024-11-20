import type { ErrorSchema } from "$schema";
import { DurableObjectStore } from "@hono-rate-limiter/cloudflare";
import type { KeyData } from "@packages/key-types";
import { rateLimiter } from "hono-rate-limiter";
import { createMiddleware } from "hono/factory";

const MILLISECONDS_PER_HOUR = 60 * 60 * 1_000;
const REQUESTS_PER_HOUR = 25_000;

export const globalRateLimiter = createMiddleware<{ Bindings: Env }>((c, next) =>
  rateLimiter<{ Bindings: Env }>({
    windowMs: MILLISECONDS_PER_HOUR,
    limit: async (c) => {
      const key = c.req.header("authorization");
      return key
        ? await c.env.API_KEYS.get<KeyData>(key.split(" ", 2)[1], { type: "json" }).then(
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
