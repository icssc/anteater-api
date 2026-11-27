import type { AccessControlledResource } from "@packages/key-types";
import { createMiddleware } from "hono/factory";
import { HTTPException } from "hono/http-exception";
import type { HonoEnvironment } from "./index.ts";

/**
 * Middleware for restricting access to certain routes.
 *
 * This should be used at the route level only, since it assumes the API key is valid,
 * and we validate API keys at the top level.
 */
export const accessController = (resource: AccessControlledResource) =>
  createMiddleware<HonoEnvironment>(async (c, next) => {
    if (!c.get("key")?.keyData.resources?.[resource]) {
      throw new HTTPException(401, {
        message: "The specified API key is not permitted to access this resource",
      });
    }
    await next();
  });
