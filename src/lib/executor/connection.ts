import { quoteIdentifier, type DescribedColumn } from "../canonical/sql";

/** A value as an engine returns it. Engines may return integers as `bigint`. */
export type SqlCell = string | number | bigint | boolean | null;

export interface SqlRows {
  readonly columns: readonly string[];
  readonly rows: readonly (readonly SqlCell[])[];
}

/**
 * The little the executor needs from DuckDB, so the browser worker (DuckDB-WASM) and tests
 * (native DuckDB) run the same execution. A method rejects when DuckDB reports an error, with
 * DuckDB's message as the error's message.
 */
export interface SqlConnection {
  /** Runs one statement and discards its result. */
  run(sql: string): Promise<void>;
  /** Runs one query and returns its rows. */
  query(sql: string): Promise<SqlRows>;
}

/** The quoted `schema.name` of a relation. */
export function relationName(schema: string, name: string): string {
  return `${quoteIdentifier(schema)}.${quoteIdentifier(name)}`;
}

/** The columns of a relation, in order, as `DESCRIBE` reports them. */
export async function describe(
  connection: SqlConnection,
  relation: string,
): Promise<DescribedColumn[]> {
  const { rows } = await connection.query(`DESCRIBE ${relation}`);
  return rows.map(([name, type]) => {
    if (typeof name !== "string" || typeof type !== "string") {
      throw new Error(`DESCRIBE ${relation} returned a column without a name or type.`);
    }
    return { name, type };
  });
}

/** How many rows a relation holds, or a view returns. */
export async function countRows(connection: SqlConnection, relation: string): Promise<number> {
  // DOUBLE, so engines return a plain number and a runaway count cannot overflow.
  const { rows } = await connection.query(`SELECT CAST(count(*) AS DOUBLE) FROM ${relation}`);
  const count = rows[0]?.[0];
  if (typeof count !== "number") throw new Error(`Counting ${relation} returned no number.`);
  return count;
}
