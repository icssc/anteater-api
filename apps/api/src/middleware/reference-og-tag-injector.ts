import { createMiddleware } from "hono/factory";
import { html } from "hono/html";

const ogDescription = "API Reference for Anteater API, the unified API for UCI related data.";
const ogImage = "https://anteaterapi.com/og.jpg";

export const referenceOgTagInjector = (ogTitle: string) =>
  createMiddleware(async (c, next) => {
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
  });
