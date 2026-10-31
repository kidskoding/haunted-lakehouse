import { beforeAll, describe, expect, it } from "vitest";
import { toQueryResult } from "./arrow";
import type { QueryResult } from "./protocol";
import { wasmDatabase } from "./testing/wasm-duckdb";

let read: (sql: string) => Promise<QueryResult>;

beforeAll(async () => {
  const db = await wasmDatabase();
  read = async (sql) => toQueryResult(await db.query(sql));
}, 60_000);

// Every expression must print exactly as DuckDB's own CAST to VARCHAR prints it.
const AS_DUCKDB_TEXT = [
  "DATE '2026-10-31'",
  "DATE '1969-12-31'",
  "DATE '0001-01-01'",
  "DATE '0044-03-15 (BC)'",
  "'infinity'::DATE",
  "'-infinity'::DATE",
  "TIMESTAMP '2026-10-31 18:00:01.123456'",
  "TIMESTAMP '2026-11-01 01:30:00'",
  "TIMESTAMP '1969-12-31 23:59:59.999999'",
  "TIMESTAMP '0044-03-15 (BC) 12:00:00.5'",
  "TIMESTAMP_S '2026-10-31 18:00:01'",
  "TIMESTAMP_MS '2026-10-31 18:00:01.120'",
  "TIMESTAMP_NS '2026-10-31 18:00:01.123456789'",
  "TIMESTAMPTZ '2026-10-31 18:00:00.25+00'",
  "TIME '01:30:00'",
  "TIME '23:59:59.999999'",
  "INTERVAL '1 month 2 days 90 minutes'",
  "INTERVAL '14 months'",
  "INTERVAL '-13 months'",
  "INTERVAL '1 year'",
  "INTERVAL '0 seconds'",
  "INTERVAL '-1 day -2 hours'",
  "INTERVAL '1 day 1.5 seconds'",
  "INTERVAL '-90 minutes'",
  "INTERVAL '30 hours'",
  "12.50::DECIMAL(6, 2)",
  "-1.5::DECIMAL(4, 1)",
  "-0.05::DECIMAL(4, 2)",
  "123456789.123456789::DECIMAL(18, 9)",
  "12345678901234567890.12::DECIMAL(38, 2)",
  "170141183460469231731687303715884105727::HUGEINT",
  "'\\xAA\\x00ab\\x5C\\x7F '::BLOB",
  "'pumpkin'",
  "UUID '00000000-0000-0000-0000-000000000001'",
];

describe("toQueryResult", () => {
  it.each(AS_DUCKDB_TEXT)("prints %s as DuckDB does", async (expression) => {
    const result = await read(`SELECT ${expression} AS v, (${expression})::VARCHAR AS t`);
    const [cell, text] = result.rows[0] ?? [];
    expect(cell).toBe(text);
  });

  it("keeps numbers and booleans as JavaScript values, and BIGINT exact", async () => {
    const result = await read(
      "SELECT 1::TINYINT a, 2.5::DOUBLE b, 1.5::FLOAT c, TRUE d, 9007199254740993::BIGINT e, 18446744073709551615::UBIGINT f",
    );
    expect(result.rows).toEqual([
      [1, 2.5, 1.5, true, 9_007_199_254_740_993n, 18_446_744_073_709_551_615n],
    ]);
  });

  it("returns nulls for every type and keeps column names and order", async () => {
    const result = await read(
      "SELECT NULL::DATE z, NULL::TIMESTAMP y, NULL::INTERVAL x, NULL::DECIMAL(6,2) w, NULL::BLOB v, NULL::INT u",
    );
    expect(result.columns.map((c) => c.name)).toEqual(["z", "y", "x", "w", "v", "u"]);
    expect(result.rows).toEqual([[null, null, null, null, null, null]]);
  });

  it("reads every row of a result that spans several Arrow chunks", async () => {
    const result = await read(
      "SELECT i, TIMESTAMP '2026-10-31 18:00:00' + to_seconds(i) AS ts FROM range(5000) t(i) ORDER BY i",
    );
    expect(result.rows).toHaveLength(5000);
    expect(result.rows[4999]).toEqual([4999n, "2026-10-31 19:23:19"]);
    expect(result.rows[2048]).toEqual([2048n, "2026-10-31 18:34:08"]);
  });

  it("prints nested values as JSON text", async () => {
    const result = await read("SELECT [1, 2] AS l, {'k': 'v', 'n': 9007199254740993::BIGINT} AS s");
    expect(result.rows).toEqual([["[1,2]", '{"k":"v","n":"9007199254740993"}']]);
  });
});
