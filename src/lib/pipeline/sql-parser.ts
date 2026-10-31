import type { SqlParser } from "./types";

/** The query that asks DuckDB for `sql`'s parse tree, with `sql` as a string literal. */
export function serializeQuery(sql: string): string {
  return `SELECT json_serialize_sql('${sql.replaceAll("'", "''")}')`;
}

/**
 * Builds a `SqlParser` on any DuckDB connection, given a function that runs one query and
 * returns its single text cell. The browser worker and native tests share this, so both
 * engines parse model SQL through the same query.
 */
export function jsonSerializeSqlParser(readText: (query: string) => Promise<string>): SqlParser {
  return async (sql) => JSON.parse(await readText(serializeQuery(sql))) as unknown;
}
