import { createMiddleware } from "hono/factory";

const BROWSER_IDENTIFIERS = [
  "Mozilla",
  "Chrome",
  "Safari",
  "Firefox",
  "Edge",
  "Opera",
  "Edg",
  "WebKit",
] as const;

export const redirectBrowserToDocs = createMiddleware(async (c, next) => {
  const userAgent = c.req.header("user-agent") || "";

  const isBrowser = BROWSER_IDENTIFIERS.some((browser) => userAgent.includes(browser));

  if (isBrowser) {
    return c.redirect("/reference");
  }

  await next();
});
