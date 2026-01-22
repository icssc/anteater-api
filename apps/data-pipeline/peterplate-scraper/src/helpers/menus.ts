import type { database } from "@packages/db";
import type { InsertMenu } from "@packages/db/schema";
import { menus } from "@packages/db/schema";
import { upsert } from "./utils";

export const upsertMenu = async (db: ReturnType<typeof database>, menu: InsertMenu) =>
  await upsert(db, menus, menu, {
    target: menus.id,
    set: menu,
  });
