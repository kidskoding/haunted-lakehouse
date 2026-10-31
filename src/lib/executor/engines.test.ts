import { describe, expect, it } from "vitest";
import { hashTable, tableFromRows, type CanonicalCell } from "../canonical/hash";
import type { SqlCell, SqlConnection } from "./connection";
import { STEP_TIME_LIMIT_MS } from "./execute";
import { runNight, runPreview, type NightInput, type PreviewResult } from "./night";
import { compileProject } from "./test-connection";
import { ENGINES, type TestEngine } from "./test-engines";
import type { NightBatch, NightEvent, RawRow } from "./types";

// The browser runs the player's pipeline on DuckDB-WASM; every test and the server's
// reasoning run on native DuckDB. Each scenario below runs on both, and both must observe
// exactly the same thing: the same events, gold hashes, error codes, messages, and positions,
// and the same relation contents afterwards. Where the builds genuinely differ, the
// difference is pinned down at the end of this file instead of being hidden.

type Files = Readonly<Record<string, string>>;
type Rows = (readonly SqlCell[])[];

const TIMEOUT_MS = 60_000;

function scans(...perBatch: RawRow[][]): NightBatch[] {
  return perBatch.map((rows, index) => ({ index, feeds: { scans: rows } }));
}

function feedsOf(batches: readonly NightBatch[]): string[] {
  return Object.keys(batches[0]?.feeds ?? {});
}

async function rows(connection: SqlConnection, sql: string): Promise<Rows> {
  return (await connection.query(sql)).rows.map((row) => [...row]);
}

/** Every rejection's message, so error text is compared across engines too. */
async function rejection(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
  throw new Error("Expected the engine to reject.");
}

async function preview(
  connection: SqlConnection,
  files: Files,
  batches: readonly NightBatch[],
  retention: number,
  replayBatch: number | null = null,
): Promise<PreviewResult> {
  const pipeline = await compileProject(files, feedsOf(batches));
  return runPreview(connection, { pipeline, batches, retention, replayBatch });
}

async function night(
  connection: SqlConnection,
  files: Files,
  input: Omit<NightInput, "pipeline">,
): Promise<readonly NightEvent[]> {
  const pipeline = await compileProject(files, feedsOf(input.batches));
  const result = await runNight(connection, { pipeline, ...input });
  if (!result.started) throw new Error(`Missing gold: ${result.missingGold.join(", ")}`);
  return result.events;
}

/** A checkpoint after every batch, labelled by its index. */
function everyBatch(batches: readonly NightBatch[]) {
  return batches.map((batch) => ({
    id: `c${String(batch.index)}`,
    afterBatch: batch.index,
    label: `after ${String(batch.index)}`,
  }));
}

/** The hash the server would expect for these rows. */
function hashOf(
  columns: readonly string[],
  expected: readonly Readonly<Record<string, CanonicalCell>>[],
): Promise<string> {
  return hashTable(tableFromRows(columns, expected));
}

/** The checkpoint hashes of a night's events, in order, keyed by gold table. */
function checkpointHashes(events: readonly NightEvent[]) {
  return events.map((event) => {
    if (event.kind !== "checkpoint") throw new Error(`Unexpected ${event.kind} event.`);
    return event.hashes;
  });
}

interface Scenario {
  readonly name: string;
  readonly run: (connection: SqlConnection) => Promise<{
    readonly observed: unknown;
    readonly check: () => void | Promise<void>;
  }>;
}

/** A scenario: what to observe on an engine, and what that observation must be. */
function scenario<T>(
  name: string,
  observe: (connection: SqlConnection) => Promise<T>,
  check: (observed: T) => void | Promise<void>,
): Scenario {
  return {
    name,
    run: async (connection) => {
      const observed = await observe(connection);
      return { observed, check: () => check(observed) };
    },
  };
}

const THREE = scans([{ kid: "a", n: 1 }], [{ kid: "b", n: 2 }], [{ kid: "c", n: 3 }]);

// Runtime contract section 12, verbatim.
const PORCH_STATE = `{{ config(materialized='incremental', unique_key='house_id') }}
with latest as (
  select house_id, arg_max(state, seq) as state, max(seq) as seq
  from {{ new_batch('porch_events') }}
  group by house_id
)
{% if is_incremental() %}
select l.* from latest l
left join {{ this }} t using (house_id)
where t.seq is null or l.seq > t.seq
{% else %}
select * from latest
{% endif %}
`;
const APPEND_PORCH_STATE = `{{ config(materialized='incremental') }}
select house_id, arg_max(state, seq) as state, max(seq) as seq
from {{ new_batch('porch_events') }}
group by house_id
`;
const LIT_HOUSES = `{{ config(materialized='view') }}
select house_id from silver.porch_state where state = 'on'
`;
const TRAP_LIT_HOUSES = `{{ config(materialized='table') }}
select house_id from bronze.porch_events
qualify row_number() over (partition by house_id order by seq desc) = 1 and state = 'on'
`;
const SPEC_PASS = "798c0122e661b51aa92613caa56c876640a9c2eb9af0a858930cf1d0fd9a5166";
const SPEC_TRAP = "b418caf918002698f13c7412ef67bb793ad1a3301fd7ee6e6793f8da8937a162";
const porch = (house_id: string, state: string, seq: number) => ({ house_id, state, seq });
const PORCH_NIGHT = {
  batches: [
    [porch("h1", "on", 1), porch("h2", "on", 1)],
    [porch("h1", "off", 2), porch("h3", "on", 1)],
    [porch("h3", "off", 2), porch("h4", "on", 1)],
  ].map((rows, index) => ({ index, feeds: { porch_events: rows } })),
  checkpoints: [{ id: "c1", afterBatch: 2, label: "8:00pm" }],
  retention: 2,
  goldTables: ["gold.lit_houses"],
};

/**
 * A connection whose clock jumps past the step limit at the `occurrence`th statement that
 * starts with `prefix`, so the step fails after that statement ran inside its transaction.
 */
function stallingOn(connection: SqlConnection, prefix: string, occurrence = 1) {
  let clock = 0;
  let seen = 0;
  const stalling: SqlConnection = {
    run: async (sql) => {
      if (sql.startsWith(prefix)) {
        seen += 1;
        if (seen === occurrence) clock += STEP_TIME_LIMIT_MS + 1;
      }
      await connection.run(sql);
    },
    query: (sql) => connection.query(sql),
  };
  return { connection: stalling, now: () => clock };
}

const SCRATCH_TABLES =
  "select table_name from duckdb_tables() where schema_name = '__hl' order by table_name";

const SCENARIOS: readonly Scenario[] = [
  scenario(
    "view: recomputed on every read, so it sees bronze after retention",
    (connection) =>
      night(
        connection,
        { "gold/kids.sql": "select kid from bronze.scans" },
        { batches: THREE, checkpoints: everyBatch(THREE), retention: 2, goldTables: ["gold.kids"] },
      ),
    async (events) => {
      const kids = (...names: string[]) =>
        hashOf(
          ["kid"],
          names.map((kid) => ({ kid })),
        );
      expect(checkpointHashes(events)).toEqual([
        { "gold.kids": await kids("a") },
        { "gold.kids": await kids("a", "b") },
        { "gold.kids": await kids("b", "c") },
      ]);
    },
  ),

  scenario(
    "view: recreated every step, so it survives a bronze type change",
    async (connection) => ({
      result: await preview(
        connection,
        { "gold/ns.sql": "select n, typeof(n) as type from bronze.scans" },
        scans([{ n: 1 }], [{ n: "two" }]),
        2,
      ),
      ns: await rows(connection, "select n, type from gold.ns order by n"),
    }),
    (observed) => {
      expect(observed).toEqual({
        result: { completed: [0, 1], error: null },
        ns: [
          ["1", "VARCHAR"],
          ["two", "VARCHAR"],
        ],
      });
    },
  ),

  scenario(
    "table: rebuilt in full after every batch from what bronze retains",
    (connection) =>
      night(
        connection,
        {
          "gold/kids.sql":
            "{{ config(materialized='table') }} select count(*) as kids, max(_batch) as last from bronze.scans",
        },
        { batches: THREE, checkpoints: everyBatch(THREE), retention: 1, goldTables: ["gold.kids"] },
      ),
    async (events) => {
      const at = (last: number) => hashOf(["kids", "last"], [{ kids: 1, last }]);
      expect(checkpointHashes(events)).toEqual([
        { "gold.kids": await at(0) },
        { "gold.kids": await at(1) },
        { "gold.kids": await at(2) },
      ]);
    },
  ),

  scenario(
    "incremental append: state remembers what retention made bronze forget",
    (connection) =>
      night(
        connection,
        {
          "silver/seen.sql":
            "{{ config(materialized='incremental') }} select kid, n from {{ new_batch('scans') }}",
          "gold/total.sql": "select sum(n) as total, count(*) as kids from silver.seen",
          "gold/bronze_total.sql":
            "{{ config(materialized='table') }} select sum(n) as total, count(*) as kids from bronze.scans",
        },
        {
          batches: THREE,
          checkpoints: everyBatch(THREE),
          retention: 1,
          goldTables: ["gold.total", "gold.bronze_total"],
        },
      ),
    async (events) => {
      const totals = (total: number, kids: number) => hashOf(["total", "kids"], [{ total, kids }]);
      expect(checkpointHashes(events)).toEqual([
        { "gold.total": await totals(1, 1), "gold.bronze_total": await totals(1, 1) },
        { "gold.total": await totals(3, 2), "gold.bronze_total": await totals(2, 1) },
        { "gold.total": await totals(6, 3), "gold.bronze_total": await totals(3, 1) },
      ]);
    },
  ),

  scenario(
    "incremental keyed merge: DELETE … WHERE EXISTS replaces exactly the matching keys",
    async (connection) => ({
      result: await preview(
        connection,
        {
          "silver/latest.sql": `{{ config(materialized='incremental', unique_key=['KID', 'Door']) }}
select kid, door, n, note from {{ new_batch('scans') }}`,
        },
        scans(
          [
            { kid: "a", door: 1, n: 1, note: "first" },
            { kid: "a", door: 2, n: 1, note: null },
            { kid: "b", door: 1, n: 1, note: "first" },
          ],
          [
            { kid: "a", door: 2, n: 5, note: "again" },
            { kid: "b", door: 2, n: 7, note: null },
          ],
          [{ kid: "a", door: 1, n: 9, note: null }],
        ),
        1,
      ),
      latest: await rows(
        connection,
        "select kid, door, n, note from silver.latest order by kid, door",
      ),
      types: await rows(
        connection,
        "select column_name, data_type from information_schema.columns " +
          "where table_schema = 'silver' order by ordinal_position",
      ),
      scratch: await rows(connection, SCRATCH_TABLES),
    }),
    (observed) => {
      expect(observed).toEqual({
        result: { completed: [0, 1, 2], error: null },
        latest: [
          ["a", 1n, 9n, null],
          ["a", 2n, 5n, "again"],
          ["b", 1n, 1n, "first"],
          ["b", 2n, 7n, null],
        ],
        types: [
          ["kid", "VARCHAR"],
          ["door", "BIGINT"],
          ["n", "BIGINT"],
          ["note", "VARCHAR"],
        ],
        scratch: [["new_batch_scans"]],
      });
    },
  ),

  scenario(
    "incremental: later batches are cast to the state's types, matching columns by name",
    async (connection) => ({
      result: await preview(
        connection,
        {
          "silver/seen.sql": `{{ config(materialized='incremental', unique_key='kid') }}
{% if is_incremental() %}
select cast(n as double) + 0.5 as n, upper(kid) as KID from {{ new_batch('scans') }}
{% else %}
select kid, n from {{ new_batch('scans') }}
{% endif %}`,
        },
        scans([{ kid: "a", n: 1 }], [{ kid: "b", n: 2 }], [{ kid: "c", n: -3 }]),
        1,
      ),
      seen: await rows(connection, "select typeof(n), kid, n from silver.seen order by kid"),
    }),
    (observed) => {
      // A DOUBLE casts to BIGINT rounding ties to even: 2.5 is 2, and -2.5 is -2.
      expect(observed).toEqual({
        result: { completed: [0, 1, 2], error: null },
        seen: [
          ["BIGINT", "B", 2n],
          ["BIGINT", "C", -2n],
          ["BIGINT", "a", 1n],
        ],
      });
    },
  ),

  scenario(
    "retention keeps the last N delivered batches; new_batch is unaffected by it",
    async (connection) => {
      const all = scans(
        [{ n: 0 }, { n: 1 }],
        [{ n: 2 }],
        [{ n: 3 }],
        [],
        [{ n: 4 }, { n: 5 }],
        [{ n: 6 }],
      );
      const visible = [0, 2, 3, 4].flatMap((i) => all.slice(i, i + 1));
      return {
        result: await preview(
          connection,
          {
            "silver/arrived.sql":
              "{{ config(materialized='incremental') }} select n, _batch, _seq from {{ new_batch('scans') }}",
          },
          visible,
          2,
        ),
        bronze: await rows(connection, "select n, _batch, _seq from bronze.scans order by _seq"),
        arrived: await rows(connection, "select n, _batch, _seq from silver.arrived order by _seq"),
      };
    },
    (observed) => {
      expect(observed).toEqual({
        result: { completed: [0, 2, 3, 4], error: null },
        // Batch 3 delivered no rows but still counts as one of the last two delivered.
        bronze: [
          [4n, 4, 3n],
          [5n, 4, 4n],
        ],
        arrived: [
          [0n, 0, 0n],
          [1n, 0, 1n],
          [3n, 2, 2n],
          [4n, 4, 3n],
          [5n, 4, 4n],
        ],
      });
    },
  ),

  scenario(
    "idempotency replay: a keyed merge holds, an append flinches",
    (connection) =>
      night(
        connection,
        {
          "silver/keyed.sql":
            "{{ config(materialized='incremental', unique_key='kid') }} select kid, n from {{ new_batch('scans') }}",
          "silver/appended.sql":
            "{{ config(materialized='incremental') }} select kid, n from {{ new_batch('scans') }}",
          "gold/keyed.sql": "select sum(n) as total from silver.keyed",
          "gold/appended.sql": "select sum(n) as total from silver.appended",
        },
        {
          batches: THREE,
          checkpoints: [{ id: "c2", afterBatch: 2, label: "end" }],
          retention: 1,
          goldTables: ["gold.keyed", "gold.appended"],
          replayBatch: 1,
        },
      ),
    async (events) => {
      const total = (value: number) => hashOf(["total"], [{ total: value }]);
      expect(events).toEqual([
        {
          kind: "replay",
          batch: 1,
          before: { "gold.keyed": await total(3), "gold.appended": await total(3) },
          after: { "gold.keyed": await total(3), "gold.appended": await total(5) },
        },
        {
          kind: "checkpoint",
          checkpointId: "c2",
          label: "end",
          afterBatch: 2,
          hashes: { "gold.keyed": await total(6), "gold.appended": await total(8) },
        },
      ]);
    },
  ),

  scenario(
    "bronze types drift as data arrives, and numbers print the same",
    async (connection) => ({
      result: await preview(
        connection,
        {
          "silver/types.sql": `{{ config(materialized='incremental') }}
select distinct _batch, typeof(n) as n, typeof(d) as d, typeof(f) as f, typeof(x) as x
from {{ new_batch('scans') }}`,
        },
        scans(
          [{ n: 1, d: 0.1, f: true, x: null }],
          [{ n: 2.5, d: 1e21, f: false }],
          [{ n: "three", d: 0.30000000000000004, x: -0 }],
          [{ n: 9007199254740993, d: 5e-324, f: "yes", x: 123456789.125 }],
        ),
        4,
      ),
      types: await rows(connection, "select * from silver.types order by _batch"),
      bronze: await rows(
        connection,
        "select n, cast(d as varchar), cast(f as varchar), cast(x as varchar), " +
          "cast(d as varchar) = cast(cast(d as varchar) as double)::varchar " +
          "from bronze.scans order by _seq",
      ),
      described: await rows(
        connection,
        "select column_name, column_type from (describe bronze.scans)",
      ),
    }),
    (observed) => {
      expect(observed).toEqual({
        result: { completed: [0, 1, 2, 3], error: null },
        types: [
          [0, "BIGINT", "DOUBLE", "BOOLEAN", "VARCHAR"],
          [1, "DOUBLE", "DOUBLE", "BOOLEAN", "VARCHAR"],
          [2, "VARCHAR", "DOUBLE", "BOOLEAN", "BIGINT"],
          [3, "VARCHAR", "DOUBLE", "VARCHAR", "DOUBLE"],
        ],
        bronze: [
          ["1", "0.1", "true", null, true],
          ["2.5", "1e+21", "false", null, true],
          ["three", "0.30000000000000004", null, "0.0", true],
          ["9007199254740992", "5e-324", "yes", "123456789.125", true],
        ],
        described: [
          ["d", "DOUBLE"],
          ["f", "VARCHAR"],
          ["n", "VARCHAR"],
          ["x", "DOUBLE"],
          ["_batch", "INTEGER"],
          ["_seq", "BIGINT"],
        ],
      });
    },
  ),

  scenario(
    "TIMESTAMPTZ reads and hashes as UTC on both engines",
    (connection) =>
      night(
        connection,
        {
          "gold/seen.sql":
            "{{ config(materialized='table') }} select cast(ts as timestamptz) as seen, cast(ts as timestamptz)::varchar as text from bronze.scans",
        },
        {
          batches: scans([{ ts: "2026-11-01 01:30:00-05" }, { ts: "2026-11-01 06:30:00.25" }]),
          checkpoints: [{ id: "c0", afterBatch: 0, label: "now" }],
          retention: 1,
          goldTables: ["gold.seen"],
        },
      ),
    async (events) => {
      expect(checkpointHashes(events)).toEqual([
        {
          "gold.seen": await hashOf(
            ["seen", "text"],
            [
              { seen: "2026-11-01 06:30:00", text: "2026-11-01 06:30:00+00" },
              { seen: "2026-11-01 06:30:00.25", text: "2026-11-01 06:30:00.25+00" },
            ],
          ),
        },
      ]);
    },
  ),

  scenario(
    "runtime error: a binder error points at the model's line and column",
    (connection) =>
      preview(connection, { "gold/kids.sql": "select kid,\n  nope\nfrom bronze.scans" }, THREE, 2),
    (result) => {
      expect(result).toEqual({
        completed: [],
        error: {
          code: "sql",
          batch: 0,
          model: "gold.kids",
          phase: "step",
          message:
            'Binder Error: Referenced column "nope" not found in FROM clause!\nCandidate bindings: "n", "_seq"',
          line: 2,
          column: 3,
        },
      });
    },
  ),

  scenario(
    "runtime error: a position in a line DuckDB shortens with an ellipsis",
    (connection) =>
      preview(
        connection,
        { "gold/kids.sql": `select ${"kid, ".repeat(40)}nope from bronze.scans` },
        THREE,
        2,
      ),
    (result) => {
      expect(result.error).toMatchObject({
        code: "sql",
        line: 1,
        column: `select ${"kid, ".repeat(40)}`.length + 1,
      });
    },
  ),

  scenario(
    "runtime error: a cast failure in a later batch, later models left at the batch before",
    async (connection) => ({
      result: await preview(
        connection,
        {
          "silver/a_first.sql": "{{ config(materialized='table') }} select n from bronze.scans",
          "silver/b_broken.sql":
            "{{ config(materialized='table') }}\nselect n,\n  cast(kid as integer) as k from bronze.scans",
          "gold/y_after.sql":
            "{{ config(materialized='table') }} select count(*) as rows from silver.b_broken",
        },
        scans([{ kid: "1", n: 1 }], [{ kid: "x", n: 2 }]),
        2,
      ),
      first: await rows(connection, "select n from silver.a_first order by n"),
      after: await rows(connection, "select rows from gold.y_after"),
    }),
    (observed) => {
      expect(observed).toEqual({
        result: {
          completed: [0],
          error: {
            code: "sql",
            batch: 1,
            model: "silver.b_broken",
            phase: "step",
            message:
              "Conversion Error: Could not convert string 'x' to INT32 when casting from source column kid",
            line: 3,
            column: 3,
          },
        },
        first: [[1n], [2n]],
        after: [[1n]],
      });
    },
  ),

  scenario(
    "runtime error: a value that cannot be cast to the state's type",
    (connection) =>
      preview(
        connection,
        {
          "silver/seen.sql":
            "{{ config(materialized='incremental') }} select n from {{ new_batch('scans') }}",
        },
        scans([{ n: 1 }], [{ n: "two" }]),
        2,
      ),
    (result) => {
      // The failing cast is the executor's own, so DuckDB's position points into executor SQL
      // and the error carries no line or column in the model.
      expect(result).toEqual({
        completed: [0],
        error: {
          code: "sql",
          batch: 1,
          model: "silver.seen",
          phase: "step",
          message: expect.stringMatching(
            /^Conversion Error: Could not convert string 'two' to INT64 when casting from source column n\b/,
          ) as unknown,
        },
      });
    },
  ),

  scenario(
    "runtime error: two rows of one batch's output share a key, and state keeps its rows",
    async (connection) => ({
      result: await preview(
        connection,
        {
          "silver/latest.sql":
            "{{ config(materialized='incremental', unique_key='kid') }} select kid, n from {{ new_batch('scans') }}",
        },
        scans(
          [{ kid: "a", n: 1 }],
          [
            { kid: "a", n: 2 },
            { kid: "b", n: 1 },
            { kid: "b", n: 2 },
          ],
        ),
        2,
      ),
      latest: await rows(connection, "select kid, n from silver.latest"),
    }),
    (observed) => {
      expect(observed).toEqual({
        result: {
          completed: [0],
          error: {
            code: "duplicate_key",
            batch: 1,
            model: "silver.latest",
            phase: "step",
            message: "More than one row of this batch's output has the key (kid) = (b).",
          },
        },
        latest: [["a", 1n]],
      });
    },
  ),

  scenario(
    "runtime error: NULL keys, named with their count",
    (connection) =>
      preview(
        connection,
        {
          "silver/latest.sql":
            "{{ config(materialized='incremental', unique_key='kid') }} select kid from {{ new_batch('scans') }}",
        },
        scans([{ kid: "a" }, { kid: null }, { kid: null }]),
        2,
      ),
    (result) => {
      expect(result).toEqual({
        completed: [],
        error: {
          code: "null_key",
          batch: 0,
          model: "silver.latest",
          phase: "step",
          message: "2 rows have NULL in the unique_key column `kid`.",
        },
      });
    },
  ),

  scenario(
    "runtime error: a batch's output changes shape from the state's",
    (connection) =>
      preview(
        connection,
        {
          "silver/seen.sql": `{{ config(materialized='incremental') }}
{% if is_incremental() %}
select kid, n as amount from {{ new_batch('scans') }}
{% else %}
select kid, n from {{ new_batch('scans') }}
{% endif %}`,
        },
        THREE,
        2,
      ),
    (result) => {
      expect(result).toEqual({
        completed: [0],
        error: {
          code: "shape_mismatch",
          batch: 1,
          model: "silver.seen",
          phase: "step",
          message:
            "This batch's output has different columns from the model's state: it adds `amount` and it is missing `n`.",
        },
      });
    },
  ),

  scenario(
    "runtime error: a unique_key the output does not have",
    (connection) =>
      preview(
        connection,
        {
          "silver/latest.sql":
            "{{ config(materialized='incremental', unique_key='house') }} select kid from {{ new_batch('scans') }}",
        },
        THREE,
        2,
      ),
    (result) => {
      expect(result.error).toMatchObject({ code: "missing_key_column", batch: 0 });
    },
  ),

  scenario(
    "external access is off for the player's SQL, and stays off",
    async (connection) => ({
      result: await preview(
        connection,
        { "gold/kids.sql": "select kid from bronze.scans" },
        THREE,
        2,
      ),
      read: await rejection(connection.query("select * from read_csv('/etc/hostname')")),
      reopen: await rejection(connection.run("SET enable_external_access = true")),
      setting: await rows(connection, "select current_setting('enable_external_access')"),
    }),
    (observed) => {
      expect(observed.result).toEqual({ completed: [0, 1, 2], error: null });
      expect(observed.read).toMatch(/disabled by configuration/);
      expect(observed.reopen).toMatch(/Cannot change enable_external_access/);
      expect(observed.setting).toEqual([[false]]);
    },
  ),

  scenario(
    "transactional DDL: a keyed merge that fails after its DELETE rolls back whole",
    async (connection) => {
      const stalled = stallingOn(connection, 'DELETE FROM "silver"."latest"');
      const pipeline = await compileProject(
        {
          "silver/latest.sql":
            "{{ config(materialized='incremental', unique_key='kid') }} select kid, n from {{ new_batch('scans') }}",
        },
        ["scans"],
      );
      const result = await runPreview(
        stalled.connection,
        {
          pipeline,
          batches: scans(
            [
              { kid: "a", n: 1 },
              { kid: "b", n: 1 },
            ],
            [
              { kid: "a", n: 2 },
              { kid: "c", n: 2 },
            ],
          ),
          retention: 2,
        },
        { now: stalled.now },
      );
      return {
        result,
        latest: await rows(connection, "select kid, n from silver.latest order by kid"),
        scratch: await rows(connection, SCRATCH_TABLES),
      };
    },
    (observed) => {
      expect(observed.result.error).toMatchObject({
        code: "step_time_limit",
        batch: 1,
        model: "silver.latest",
      });
      expect(observed.latest).toEqual([
        ["a", 1n],
        ["b", 1n],
      ]);
      expect(observed.scratch).toEqual([["new_batch_scans"]]);
    },
  ),

  scenario(
    "transactional DDL: a table replaced and then rolled back keeps its old rows",
    async (connection) => {
      const stalled = stallingOn(connection, 'CREATE OR REPLACE TABLE "gold"."kids"', 2);
      const pipeline = await compileProject(
        { "gold/kids.sql": "{{ config(materialized='table') }} select kid from bronze.scans" },
        ["scans"],
      );
      const result = await runPreview(
        stalled.connection,
        { pipeline, batches: THREE, retention: 1 },
        { now: stalled.now },
      );
      return { result, kids: await rows(connection, "select kid from gold.kids") };
    },
    (observed) => {
      expect(observed).toEqual({
        result: {
          completed: [0],
          error: {
            code: "step_time_limit",
            batch: 1,
            model: "gold.kids",
            phase: "step",
            message: "This model's step ran longer than 10 s.",
          },
        },
        kids: [["a"]],
      });
    },
  ),

  scenario(
    "transactional DDL: an incremental model's first step, rolled back, leaves no relation",
    async (connection) => {
      const stalled = stallingOn(connection, 'CREATE TABLE "silver"."seen"');
      const pipeline = await compileProject(
        {
          "silver/seen.sql":
            "{{ config(materialized='incremental') }} select kid from {{ new_batch('scans') }}",
        },
        ["scans"],
      );
      const result = await runPreview(
        stalled.connection,
        { pipeline, batches: THREE, retention: 1 },
        { now: stalled.now },
      );
      return {
        result,
        missing: await rejection(connection.query("select * from silver.seen")),
        scratch: await rows(connection, SCRATCH_TABLES),
      };
    },
    (observed) => {
      expect(observed.result.error).toMatchObject({ code: "step_time_limit", batch: 0 });
      expect(observed.missing).toMatch(/Table with name seen does not exist/);
      expect(observed.scratch).toEqual([["new_batch_scans"]]);
    },
  ),

  scenario(
    "the worked example: the reference survives c1 with the spec's hash",
    (connection) =>
      night(
        connection,
        { "silver/porch_state.sql": PORCH_STATE, "gold/lit_houses.sql": LIT_HOUSES },
        PORCH_NIGHT,
      ),
    (events) => {
      expect(events).toEqual([
        {
          kind: "checkpoint",
          checkpointId: "c1",
          label: "8:00pm",
          afterBatch: 2,
          hashes: { "gold.lit_houses": SPEC_PASS },
        },
      ]);
    },
  ),

  scenario(
    "the worked example: the trap breaks c1 with the spec's hash",
    (connection) => night(connection, { "gold/lit_houses.sql": TRAP_LIT_HOUSES }, PORCH_NIGHT),
    (events) => {
      expect(checkpointHashes(events)).toEqual([{ "gold.lit_houses": SPEC_TRAP }]);
    },
  ),

  scenario(
    "the worked example: replaying batch 2 leaves the keyed model unmoved",
    (connection) =>
      night(
        connection,
        { "silver/porch_state.sql": PORCH_STATE, "gold/lit_houses.sql": LIT_HOUSES },
        { ...PORCH_NIGHT, replayBatch: 2 },
      ),
    (events) => {
      expect(events).toEqual([
        {
          kind: "replay",
          batch: 2,
          before: { "gold.lit_houses": SPEC_PASS },
          after: { "gold.lit_houses": SPEC_PASS },
        },
        {
          kind: "checkpoint",
          checkpointId: "c1",
          label: "8:00pm",
          afterBatch: 2,
          hashes: { "gold.lit_houses": SPEC_PASS },
        },
      ]);
    },
  ),

  scenario(
    "the worked example: replaying batch 2 doubles h4 in the append-only variant",
    (connection) =>
      night(
        connection,
        { "silver/porch_state.sql": APPEND_PORCH_STATE, "gold/lit_houses.sql": LIT_HOUSES },
        { ...PORCH_NIGHT, replayBatch: 2 },
      ),
    async (events) => {
      // Appending keeps every house's old states, so h1 and h3 stay lit even before the replay.
      const lit = (...houses: string[]) =>
        hashOf(
          ["house_id"],
          houses.map((house_id) => ({ house_id })),
        );
      const doubled = await lit("h1", "h2", "h3", "h4", "h4");
      expect(events).toEqual([
        {
          kind: "replay",
          batch: 2,
          before: { "gold.lit_houses": await lit("h1", "h2", "h3", "h4") },
          after: { "gold.lit_houses": doubled },
        },
        {
          kind: "checkpoint",
          checkpointId: "c1",
          label: "8:00pm",
          afterBatch: 2,
          hashes: { "gold.lit_houses": doubled },
        },
      ]);
    },
  ),
];

describe.each(SCENARIOS)("$name", ({ run }) => {
  const observed = new Map<TestEngine["name"], unknown>();

  it.each(ENGINES)(
    "on $name DuckDB",
    async ({ name, connect }) => {
      const outcome = await run(await connect());
      observed.set(name, outcome.observed);
      await outcome.check();
    },
    TIMEOUT_MS,
  );

  it("is identical on both engines", () => {
    expect(observed.size).toBe(ENGINES.length);
    expect(observed.get("wasm")).toEqual(observed.get("native"));
  });
});

// Where the builds differ. Native DuckDB ships the icu, json, and parquet extensions loaded;
// the DuckDB-WASM build has only core functions, and would have to download the rest. The
// executor turns off external access before any model runs, so on WASM a model that needs one
// of them fails at once with the same error every time, instead of reaching the network.
// Puzzles MUST NOT need these functions (runtime contract 10.1).

interface Divergence {
  readonly name: string;
  readonly sql: string;
  /** What native DuckDB returns for `sql` as a gold table's single value. */
  readonly native: string;
  /** The extension WASM would have to download. */
  readonly extension: "icu" | "json" | "parquet";
}

const DIVERGENCES: readonly Divergence[] = [
  {
    name: "TIMESTAMPTZ arithmetic needs ICU",
    sql: "select cast(date_trunc('hour', cast(ts as timestamptz)) as varchar) as v from bronze.scans",
    native: "2026-11-01 06:00:00+00",
    extension: "icu",
  },
  {
    name: "JSON functions need the json extension",
    sql: `select json_extract_string('"' || ts || '"', '$') as v from bronze.scans`,
    native: "2026-11-01 06:30:00",
    extension: "json",
  },
];

describe.each(ENGINES)("documented divergences on $name DuckDB", ({ name, connect }) => {
  const batches = scans([{ ts: "2026-11-01 06:30:00" }]);

  it.each(DIVERGENCES)(
    "$name",
    async (divergence) => {
      const connection = await connect();
      const result = await preview(connection, { "gold/v.sql": divergence.sql }, batches, 1);
      if (name === "native") {
        expect(result.error).toBeNull();
        expect(await rows(connection, "select v from gold.v")).toEqual([[divergence.native]]);
      } else {
        expect(result.error).toEqual({
          code: "sql",
          batch: 0,
          model: "gold.v",
          phase: "step",
          message:
            "Extension Autoloading Error: An error occurred while trying to automatically install " +
            `the required extension '${divergence.extension}':\n` +
            "Loading external extensions is disabled through configuration",
        });
      }
    },
    TIMEOUT_MS,
  );

  it(
    "sets the session time zone to UTC only where ICU provides one",
    async () => {
      const connection = await connect();
      await preview(connection, { "gold/v.sql": "select 1 as v" }, batches, 1);
      const zones = await rows(
        connection,
        "select value from duckdb_settings() where name = 'TimeZone'",
      );
      expect(zones).toEqual(name === "native" ? [["UTC"]] : []);
    },
    TIMEOUT_MS,
  );

  it(
    "reads Parquet only where the parquet extension is loaded",
    async () => {
      const connection = await connect();
      await preview(connection, { "gold/v.sql": "select 1 as v" }, batches, 1);
      const message = await rejection(connection.query("select * from read_parquet('x.parquet')"));
      expect(message).toMatch(
        name === "native"
          ? /^Permission Error: Cannot access file "x.parquet"/
          : /^Extension Autoloading Error: .*'parquet'/,
      );
    },
    TIMEOUT_MS,
  );
});
