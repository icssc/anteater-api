import { DurableObjectStore } from "@hono-rate-limiter/cloudflare";
import { createMiddleware } from "hono/factory";
import { rateLimiter } from "hono-rate-limiter";
import type { ErrorSchema } from "$schema";
import type { HonoEnvironment } from "./index.ts";

const MILLISECONDS_PER_HOUR = 60 * 60 * 1_000;
const REQUESTS_PER_HOUR = 25_000;

export const globalRateLimiter = createMiddleware<HonoEnvironment>((c, next) =>
  rateLimiter<HonoEnvironment>({
    windowMs: MILLISECONDS_PER_HOUR,
    limit: async (c) => {
      return c.get("key")?.keyData?.rateLimitOverride ?? REQUESTS_PER_HOUR;
    },
    store: new DurableObjectStore({ namespace: c.env.RATE_LIMITER }),
    keyGenerator: (c) => c.get("key")?.key ?? "",
    handler: (c) =>
      c.json<ErrorSchema>(
        { ok: false, message: "Too many requests, please try again later." },
        429,
      ),
  })(c, next),
);
