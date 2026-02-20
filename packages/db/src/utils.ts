import type { ColumnBaseConfig, SQL } from "drizzle-orm";
import { eq, getTableColumns, sql } from "drizzle-orm";
import type { PgColumn, PgTable, PgUpdateSetSource } from "drizzle-orm/pg-core";
import { getTableConfig } from "drizzle-orm/pg-core";

export const isTrue = <T extends ColumnBaseConfig<"boolean", string>>(col: PgColumn<T>): SQL =>
  eq(col, true);

export const isFalse = <T extends ColumnBaseConfig<"boolean", string>>(col: PgColumn<T>): SQL =>
  eq(col, false);

/**
 * Shim from https://github.com/drizzle-team/drizzle-orm/issues/1728#issuecomment-1998494043 for upserts that overwrite the existing data.
 *
 * To use:
 * ```ts
 * await db
 *   .insert(table)
 *   .values(values)
 *   .onConflictDoUpdate({
 *     target: table.id, // should be primary key or indexed column(s)
 *     set: conflictUpdateSetAllCols(table),
 *   });
 * ```
 */
export function conflictUpdateSetAllCols<T extends PgTable>(table: T): PgUpdateSetSource<T> {
  const columns = getTableColumns(table);
  const { name: tableName } = getTableConfig(table);
  return Object.entries(columns).reduce((acc: PgUpdateSetSource<T>, [columnName, columnInfo]) => {
    if (!columnInfo.default && !columnInfo.generated)
      acc[columnName as keyof T["$inferInsert"]] = sql.raw(
        `COALESCE(excluded.${columnInfo.name}, ${tableName}.${columnInfo.name})`,
      );
    return acc;
  }, {});
}
