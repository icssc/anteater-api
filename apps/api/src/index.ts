import { graphqlRouter } from "$graphql";
import { defaultHook } from "$hooks";
import { globalRateLimiter, headerInjector, ipBasedRateLimiter, keyVerifier } from "$middleware";
import { restRouter } from "$rest";
import type { ErrorSchema } from "$schema";
import type { Bindings } from "$types/bindings";
import { DurableObjectRateLimiter } from "@hono-rate-limiter/cloudflare";
import { OpenAPIHono } from "@hono/zod-openapi";
import { apiReference } from "@scalar/hono-api-reference";
import { cors } from "hono/cors";

const app = new OpenAPIHono<{ Bindings: Bindings }>({ defaultHook });

app.doc("/openapi.json", {
  openapi: "3.0.0",
  info: { version: "2.0.0", title: "Anteater API" },
  servers: [
    {
      url: "https://anteaterapi.com",
    },
  ],
  tags: [
    { name: "WebSoc" },
    { name: "Grades" },
    { name: "Courses" },
    { name: "Enrollment History" },
    { name: "Instructors" },
    { name: "Calendar" },
    { name: "Other" },
  ],
});
app.get("/docs", (c) => {
  return c.redirect("/reference");
});
app.get("/reference", apiReference({ spec: { url: "/openapi.json" } }));
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
app.use("/v2/*", headerInjector);
app.use("/v2/*", keyVerifier);
app.use("/v2/*", globalRateLimiter);
app.use("/v2/*", ipBasedRateLimiter);
app.use("/v2/*", cors());
app.route("/v2/rest", restRouter);
app.route("/v2/graphql", graphqlRouter);

export { DurableObjectRateLimiter };
export default app;
