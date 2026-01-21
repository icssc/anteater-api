import type {
  PgInsert,
  PgInsertOnConflictDoUpdateConfig,
  PgInsertValue,
  PgTableWithColumns,
  TableConfig,
} from "drizzle-orm/pg-core";

import type { database } from "@packages/db";

// ! typeguard only for this file
const isNotQueryResultNever = <T extends TableConfig>(
  result: unknown,
): result is PgTableWithColumns<T>["$inferSelect"][] => Array.isArray(result);

/** Convenience function to upsert a record in a table. */
export async function upsert<T extends TableConfig>(
  db: ReturnType<typeof database>,
  table: PgTableWithColumns<T>,
  value: PgInsertValue<PgTableWithColumns<T>>,
  config: PgInsertOnConflictDoUpdateConfig<PgInsert<PgTableWithColumns<T>>>,
) {
  const result = await db.insert(table).values(value).onConflictDoUpdate(config).returning();

  if (!isNotQueryResultNever(result))
    throw new Error(
      `[upsert > ${table._.name}]: unexpected result with config ${JSON.stringify(config)}`,
    );

  if (!result[0]) throw new Error(`[upsert > ${table._.name}]: no result`);

  return result[0];
}

export async function upsertBatch<T extends TableConfig>(
  db: ReturnType<typeof database>,
  table: PgTableWithColumns<T>,
  values: PgInsertValue<PgTableWithColumns<T>>[],
  config: PgInsertOnConflictDoUpdateConfig<PgInsert<PgTableWithColumns<T>>>,
) {
  if (values.length === 0) {
    return [];
  }

  const result = await db.insert(table).values(values).onConflictDoUpdate(config).returning();

  if (!isNotQueryResultNever(result))
    throw new Error(
      `[upsertBatch > ${table._.name}]: unexpected result with config ${JSON.stringify(config)}`,
    );

  return result;
}
