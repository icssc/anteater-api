import type { KeyData } from "@packages/key-types";
import { createMiddleware } from "hono/factory";
import { HTTPException } from "hono/http-exception";

export const keyVerifier = createMiddleware<{ Bindings: Env }>(async (c, next) => {
  const header = c.req.header("authorization");
  if (header) {
    const origin = c.req.header("origin");
    const [scheme, key] = header.split(" ", 2);
    if (scheme !== "Bearer")
      throw new HTTPException(401, {
        message: `Authorization scheme '${scheme}' is not supported`,
      });
    const keyData = await c.env.API_KEYS.get<KeyData>(key, { type: "json" });
    if (!keyData) throw new HTTPException(401, { message: "Invalid or expired API key" });
    if (keyData._type === "publishable") {
      if (!origin) throw new HTTPException(401, { message: "Origin not provided" });
      if (!keyData.origins[origin]) throw new HTTPException(401, { message: "Invalid origin" });
    }
  }
  await next();
});
