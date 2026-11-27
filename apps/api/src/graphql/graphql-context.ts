import type { database } from "@packages/db";
import type { YogaInitialContext } from "graphql-yoga";
import type { Context } from "hono";
import type { HonoEnvironment } from "$middleware";

export interface GraphQLContext extends YogaInitialContext {
  db: ReturnType<typeof database>;
  honoContext: Context<HonoEnvironment>;
}
