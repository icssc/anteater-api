import { graphqlRouter } from "$graphql";
import { defaultHook } from "$hooks";
import {
  globalRateLimiter,
  headerInjector,
  ipBasedRateLimiter,
  keyVerifier,
  openapiMeta,
  redirectBrowserToDocs,
  referenceOgTagInjector,
} from "$middleware";
import { restRouter } from "$rest";
import type { ErrorSchema } from "$schema";
import { DurableObjectRateLimiter } from "@hono-rate-limiter/cloudflare";
import { OpenAPIHono } from "@hono/zod-openapi";
import { apiReference } from "@scalar/hono-api-reference";
import { cors } from "hono/cors";

const app = new OpenAPIHono<{ Bindings: Env }>({ defaultHook });

// OpenAPI and API reference configuration

const ogTitle = "Anteater API | API Reference";
app.doc("/openapi.json", openapiMeta);
app.use("/reference", referenceOgTagInjector(ogTitle)).get(
  "/reference",
  apiReference({
    spec: { url: "/openapi.json" },
    pageTitle: ogTitle,
    favicon: "/favicon.svg",
  }),
);

// Default handler configuration

app.onError((err, c) =>
  c.json<ErrorSchema>(
    { ok: false, message: err.message.replaceAll(/"/g, "'") },
    { status: "getResponse" in err ? err.getResponse().status : 500 },
  ),
);
app.notFound((c) =>
  c.json<ErrorSchema>(
    {
      ok: false,
      message: "The requested resource could not be found.",
    },
    404,
  ),
);

// Middleware configuration

app.use("/", redirectBrowserToDocs);
app.use("/v2/*", headerInjector);
app.use("/v2/*", keyVerifier);
app.use("/v2/*", globalRateLimiter);
app.use("/v2/*", ipBasedRateLimiter);
app.use("/v2/*", cors());

// REST/GraphQL router configuration

app.route("/v2/rest", restRouter);
app.route("/v2/graphql", graphqlRouter);

export { DurableObjectRateLimiter };
export default app;
