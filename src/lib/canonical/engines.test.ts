import { createRequire } from "node:module";
import path from "node:path";
import { DuckDBInstance } from "@duckdb/node-api";
import type * as WasmModule from "@duckdb/duckdb-wasm";
import { beforeAll, describe, expect, it } from "vitest";
import {
  canonicalText,
  hashTable,
  tableFromRows,
  type CanonicalCell,
  type CanonicalTable,
} from "./hash";
import { canonicalSelect, type DescribedColumn } from "./sql";

// The player's pipeline runs on DuckDB-WASM in the browser; tests and the server reason with
// the native build. Both are DuckDB 1.4.3, and this suite proves they hash gold tables alike.

const require = createRequire(import.meta.url);
const wasmEntry = require.resolve("@duckdb/duckdb-wasm/dist/duckdb-node-blocking.cjs");
const duckdbWasm = require(wasmEntry) as typeof WasmModule & {
  createDuckDB: (
    bundles: Record<string, { mainModule: string; mainWorker: string }>,
    logger: unknown,
    runtime: unknown,
  ) => Promise<{
    instantiate(): Promise<void>;
    connect(): { query(sql: string): ArrowTable };
  }>;
  NODE_RUNTIME: unknown;
};

interface ArrowTable {
  numRows: number;
  schema: { fields: { name: string }[] };
  getChildAt(i: number): { get(row: number): unknown } | null;
}

interface Engine {
  run(sql: string): Promise<void>;
  read(sql: string): Promise<CanonicalTable>;
}

function asCell(value: unknown): CanonicalCell {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }
  throw new Error(`Canonical projection returned a ${typeof value}.`);
}

async function nativeEngine(): Promise<Engine> {
  const connection = await (await DuckDBInstance.create(":memory:")).connect();
  return {
    run: async (sql) => {
      await connection.run(sql);
    },
    read: async (sql) => {
      const result = await connection.runAndReadAll(sql);
      return {
        columns: result.columnNames(),
        rows: result.getRowsJS().map((row) => row.map(asCell)),
      };
    },
  };
}

async function wasmEngine(): Promise<Engine> {
  const dist = path.dirname(wasmEntry);
  const db = await duckdbWasm.createDuckDB(
    {
      mvp: { mainModule: path.join(dist, "duckdb-mvp.wasm"), mainWorker: "" },
      eh: { mainModule: path.join(dist, "duckdb-eh.wasm"), mainWorker: "" },
    },
    new duckdbWasm.VoidLogger(),
    duckdbWasm.NODE_RUNTIME,
  );
  await db.instantiate();
  const connection = db.connect();
  return {
    run: (sql) => {
      connection.query(sql);
      return Promise.resolve();
    },
    read: (sql) => {
      const table = connection.query(sql);
      const columns = table.schema.fields.map((f) => f.name);
      const rows = Array.from({ length: table.numRows }, (_, r) =>
        columns.map((_, c) => asCell(table.getChildAt(c)?.get(r) ?? null)),
      );
      return Promise.resolve({ columns, rows });
    },
  };
}

async function readCanonical(engine: Engine, relation: string): Promise<CanonicalTable> {
  const described = await engine.read(
    `SELECT column_name, column_type FROM (DESCRIBE ${relation})`,
  );
  const columns: DescribedColumn[] = described.rows.map(([name, type]) => ({
    name: String(name),
    type: String(type),
  }));
  return engine.read(canonicalSelect(relation, columns));
}

const TRICKY = `
  CREATE TABLE tricky AS SELECT * FROM (VALUES
    (1, 0.1::DOUBLE + 0.2::DOUBLE, 12.50::DECIMAL(6,2), 9007199254740993::BIGINT, 'plain', TRUE,
      TIMESTAMP '2026-10-31 18:00:01.5', TIMESTAMPTZ '2026-11-01 06:30:00+00', DATE '2026-10-31',
      TIME '01:30:00', INTERVAL 90 MINUTE, [1, 2], {'k': 'v'}, 1.5::FLOAT),
    (2, -0.0::DOUBLE, -3.14::DECIMAL(6,2), -1::BIGINT, 'pumpkin 🎃 café', FALSE,
      TIMESTAMP '2026-11-01 01:30:00', TIMESTAMPTZ '2026-11-01 07:30:00+00', DATE '2026-11-01',
      TIME '23:59:59.999999', INTERVAL 1 DAY, [], {'k': NULL}, 0.1::FLOAT),
    (3, 'NaN'::DOUBLE, NULL, NULL, 'cafe' || chr(769), NULL,
      NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
    (4, 'Infinity'::DOUBLE, 0::DECIMAL(6,2), 0::BIGINT, 'quote " back \\ line' || chr(10) || 'end', TRUE,
      TIMESTAMP '1969-12-31 23:59:59', TIMESTAMPTZ '1970-01-01 00:00:00+00', DATE '1970-01-01',
      TIME '00:00:00', INTERVAL 0 SECOND, [NULL], {'k': ''}, -2.5::FLOAT),
    (5, 1.0 / 3.0, 1.00::DECIMAL(6,2), 42::BIGINT, 'null', TRUE,
      TIMESTAMP '2026-10-31 18:00:00', TIMESTAMPTZ '2026-10-31 18:00:00+00', DATE '2026-10-31',
      TIME '18:00:00', INTERVAL 2 HOUR, [3], {'k': 'w'}, 3.0::FLOAT),
    (5, 1.0 / 3.0, 1.00::DECIMAL(6,2), 42::BIGINT, 'null', TRUE,
      TIMESTAMP '2026-10-31 18:00:00', TIMESTAMPTZ '2026-10-31 18:00:00+00', DATE '2026-10-31',
      TIME '18:00:00', INTERVAL 2 HOUR, [3], {'k': 'w'}, 3.0::FLOAT)
  ) AS t(id, dbl, dec, big, txt, flag, ts, tstz, dt, tm, iv, lst, rec, flt)
`;

describe("canonical hashing across DuckDB builds", () => {
  let native: Engine;
  let wasm: Engine;

  beforeAll(async () => {
    [native, wasm] = await Promise.all([nativeEngine(), wasmEngine()]);
    await Promise.all([native.run(TRICKY), wasm.run(TRICKY)]);
  }, 60_000);

  it("reads every tricky value the same way on native and WASM", async () => {
    const [fromNative, fromWasm] = await Promise.all([
      readCanonical(native, "tricky"),
      readCanonical(wasm, "tricky"),
    ]);
    expect(canonicalText(fromWasm)).toBe(canonicalText(fromNative));
    expect(await hashTable(fromWasm)).toBe(await hashTable(fromNative));
  });

  it("hashes a query's rows the same whatever order the engine returns them in", async () => {
    const ordered = await readCanonical(native, "(SELECT * FROM tricky ORDER BY id DESC)");
    const shuffled = await readCanonical(wasm, "(SELECT * FROM tricky ORDER BY txt, id)");
    expect(await hashTable(shuffled)).toBe(await hashTable(ordered));
  });

  it("matches expected rows written in TypeScript, as the server writes them", async () => {
    const relation = "(SELECT id AS ID, dbl, ts, tstz, txt FROM tricky WHERE id IN (1, 2, 5))";
    const expected = tableFromRows(
      ["txt", "dbl", "ts", "tstz", "id"],
      [
        {
          id: 5,
          dbl: 0.333333333,
          ts: "2026-10-31 18:00:00",
          tstz: "2026-10-31 18:00:00",
          txt: "null",
        },
        { id: 1, dbl: 0.3, ts: "2026-10-31 18:00:01.5", tstz: "2026-11-01 06:30:00", txt: "plain" },
        { id: 5, dbl: 1 / 3, ts: "2026-10-31 18:00:00", tstz: "2026-10-31 18:00:00", txt: "null" },
        {
          id: 2,
          dbl: 0,
          ts: "2026-11-01 01:30:00",
          tstz: "2026-11-01 07:30:00",
          txt: "pumpkin 🎃 café",
        },
      ],
    );
    const [fromNative, fromWasm] = await Promise.all([
      readCanonical(native, relation),
      readCanonical(wasm, relation),
    ]);
    expect(canonicalText(fromNative)).toBe(canonicalText(expected));
    expect(canonicalText(fromWasm)).toBe(canonicalText(expected));
  });

  it("tells apart tables that differ in one cell", async () => {
    const base = await readCanonical(native, "tricky");
    const changed = await readCanonical(
      wasm,
      "(SELECT * REPLACE (CASE WHEN id = 3 THEN 'café' ELSE txt END AS txt) FROM tricky)",
    );
    expect(await hashTable(changed)).not.toBe(await hashTable(base));
  });
});
