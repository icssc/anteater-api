import type { KeyInStorage } from "@packages/key-types/src/storage.ts";
import { createMiddleware } from "hono/factory";
import { HTTPException } from "hono/http-exception";
import type { HonoEnvironment } from "./index.ts";

export const keyVerifier = createMiddleware<HonoEnvironment>(async (c, next) => {
  const header = c.req.header("authorization");
  if (header) {
    const origin = c.req.header("origin");
    const schemeSpace = header.substring(0, "Bearer ".length);
    const key = header.substring("Bearer ".length);
    if (schemeSpace !== "Bearer ") {
      throw new HTTPException(401, {
        message: `Unsupported authorization scheme`,
      });
    }

    // we can skip conversion if type checking statically verifies we don't need to
    // if there were multiple formats in the future, we could match on the discriminator here
    const keyData = await c.env.API_KEYS.get<KeyInStorage["value"]>(key, { type: "json" });
    if (!keyData) throw new HTTPException(401, { message: "Invalid or expired API key" });

    if (keyData._type === "publishable") {
      if (!origin) throw new HTTPException(401, { message: "Origin not provided" });
      if (!keyData.origins[origin]) throw new HTTPException(401, { message: "Invalid origin" });
    }

    c.set("key", { key, keyData });
  }

  await next();
});
