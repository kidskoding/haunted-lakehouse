import { DuckDBInstance } from "@duckdb/node-api";
import { jsonSerializeSqlParser } from "./sql-parser";
import type { SqlParser } from "./types";

/** A `SqlParser` on native DuckDB, the same engine version the browser runs as WASM. */
export async function nativeParser(): Promise<SqlParser> {
  const connection = await (await DuckDBInstance.create(":memory:")).connect();
  return jsonSerializeSqlParser(async (query) => {
    const reader = await connection.runAndReadAll(query);
    const cell = reader.getRowsJS()[0]?.[0];
    if (typeof cell !== "string") throw new Error("json_serialize_sql returned no text.");
    return cell;
  });
}
