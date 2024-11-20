import type { ErrorSchema } from "$schema";
import type { Bindings } from "$types/bindings";
import { DurableObjectStore } from "@hono-rate-limiter/cloudflare";
import { rateLimiter } from "hono-rate-limiter";
import { createMiddleware } from "hono/factory";

const MILLISECONDS_PER_HOUR = 60 * 60 * 1_000;
const REQUESTS_PER_HOUR = 1_000;

export const ipBasedRateLimiter = createMiddleware<{ Bindings: Bindings }>((c, next) =>
  rateLimiter<{ Bindings: Bindings }>({
    windowMs: MILLISECONDS_PER_HOUR,
    limit: REQUESTS_PER_HOUR,
    store: new DurableObjectStore({ namespace: c.env.RATE_LIMITER }),
    keyGenerator: (c) => c.req.header("cf-connecting-ip") ?? "127.0.0.1",
    skip: (c) => !!c.req.header("authorization"),
    handler: (c) =>
      c.json<ErrorSchema>(
        { ok: false, message: "Too many requests, please try again later." },
        429,
      ),
  })(c, next),
);
