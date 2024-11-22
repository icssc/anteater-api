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
import { html } from "hono/html";

const app = new OpenAPIHono<{ Bindings: Bindings }>({ defaultHook });

app.doc("/openapi.json", {
  openapi: "3.0.0",
  info: {
    version: "2.0.0",
    title: "Anteater API",
    description:
      "The unified API for UCI related data. View documentation at https://docs.icssc.club/docs/developer/anteaterapi and API reference at https://anteaterapi.com/reference.",
    contact: { email: "icssc@uci.edu" },
  },
  externalDocs: {
    url: "https://docs.icssc.club/docs/developer/anteaterapi/rest-api",
  },
  servers: [
    {
      url: "https://anteaterapi.com",
    },
  ],
  tags: [
    {
      name: "WebSoc",
      description:
        "WebSoc related data, such as valid terms and sections. Sourced directly from WebSoc.",
    },
    {
      name: "Grades",
      description:
        "Historical grade data for UCI classes, sourced via California Public Records Act (CPRA) requests. Plus / minus data not available. Data for sections with less than 10 students not available.",
    },
    {
      name: "Courses",
      description:
        "Course data, such as department, school, instructors, and previous sections. Sourced from the UCI Course Catalog,and WebSoc.",
    },
    {
      name: "Enrollment History",
      description: "Historical enrollment data for UCI. Sourced from WebSoc.",
    },
    {
      name: "Instructors",
      description: "Instructor data enriched with course data.",
    },
    { name: "Calendar", description: "Core calendar dates and current week." },
    {
      name: "LARC",
      description:
        "Present and past LARC (https://larc.uci.edu/) sections. Sourced from LARC's enrollment site (https://enroll.larc.uci.edu/).",
    },
    { name: "Other" },
    { name: "Study Rooms" },
  ],
});
app.get("/docs", (c) => {
  return c.redirect("/reference");
});

const ogTitle = "API Reference | Anteater API";
const ogDescription = "API Reference for Anteater API, the unified API for UCI related data.";
const ogImage = "https://anteaterapi.com/og.jpg";
app
  .use("/reference", async (c, next) => {
    await next();
    const body = await c.res.text();
    const index = body.indexOf("<head>") + 6;
    const meta = html`
    <meta name="description" content="${ogDescription}">
    <meta property="og:title" content="${ogTitle}">
    <meta property="og:description" content="${ogDescription}">
    <meta property="og:image" content="${ogImage}">
    <meta name="twitter:title" content="${ogTitle}">
    <meta name="twitter:description" content="${ogDescription}">
    <meta name="twitter:image" content="${ogImage}">
    <meta name="twitter:card" content="summary_large_image">`;
    c.res = new Response(body.slice(0, index) + meta + body.slice(index), c.res);
  })
  .get(
    "/reference",
    apiReference({
      spec: { url: "/openapi.json" },
      pageTitle: ogTitle,
      favicon: "/favicon.svg",
    }),
  );
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
