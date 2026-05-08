import type { AccessControlledResource, KeyData } from "@packages/key-types";
import { createMiddleware } from "hono/factory";
import { HTTPException } from "hono/http-exception";

/**
 * Middleware for restricting access to certain routes.
 *
 * This should be used at the route level only, since it assumes the API key is valid,
 * and we validate API keys at the top level.
 */
export const accessController = (resource: AccessControlledResource) =>
  createMiddleware<{ Bindings: Env }>(async (c, next) => {
    const header = c.req.header("authorization");
    if (!header) {
      throw new HTTPException(401, { message: "An API key is required to access this resource" });
    }
    const [_, key] = header.split(" ", 2);
    const keyData = await c.env.API_KEYS.get<KeyData>(key, { type: "json" });
    if (!keyData) throw new HTTPException(401, { message: "Invalid or expired API key" });
    if (!keyData.resources?.[resource]) {
      throw new HTTPException(401, {
        message: "The specified API key is not permitted to access this resource",
      });
    }
    await next();
  });
