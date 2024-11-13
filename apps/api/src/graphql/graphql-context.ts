import type { Bindings } from "$types/bindings";
import type { database } from "@packages/db";
import type { YogaInitialContext } from "graphql-yoga";
import type { Context } from "hono";

export interface GraphQLContext extends YogaInitialContext {
  db: ReturnType<typeof database>;
  honoContext: Context<{ Bindings: Bindings }>;
}
