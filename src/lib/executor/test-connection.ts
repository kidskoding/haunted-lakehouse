import { DuckDBInstance } from "@duckdb/node-api";
import { compile, type CompiledPipeline } from "../pipeline/compile";
import { nativeParser } from "../pipeline/test-parsers";
import type { SqlCell, SqlConnection } from "./connection";

function asCell(value: unknown): SqlCell {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "bigint" ||
    typeof value === "boolean"
  ) {
    return value;
  }
  throw new Error(`DuckDB returned a ${typeof value}; cast it in SQL first.`);
}

/** A `SqlConnection` on a fresh in-memory native DuckDB, the engine the browser runs as WASM. */
export async function nativeConnection(): Promise<SqlConnection> {
  const connection = await (await DuckDBInstance.create(":memory:")).connect();
  return {
    run: async (sql) => {
      await connection.run(sql);
    },
    query: async (sql) => {
      const reader = await connection.runAndReadAll(sql);
      return {
        columns: reader.columnNames(),
        rows: reader.getRowsJS().map((row) => row.map(asCell)),
      };
    },
  };
}

/** Compiles a project of `path: source` files for an hour whose feeds are `feeds`. */
export async function compileProject(
  files: Readonly<Record<string, string>>,
  feeds: readonly string[],
): Promise<CompiledPipeline> {
  const result = await compile(
    Object.entries(files).map(([path, source]) => ({ path, source })),
    { parser: await nativeParser(), knownFeeds: feeds, hourFeeds: feeds },
  );
  if (!result.ok) throw new Error(result.errors.map((error) => error.message).join("\n"));
  return result.pipeline;
}
