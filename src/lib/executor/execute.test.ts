import { describe, expect, it } from "vitest";
import type { SqlConnection } from "./connection";
import { MAX_MODEL_ROWS } from "./materialize";
import { runPreview, type PreviewResult } from "./night";
import { compileProject, nativeConnection } from "./test-connection";
import type { NightBatch, RawRow } from "./types";

const FEEDS = ["scans"];

function batches(...perBatch: RawRow[][]): NightBatch[] {
  return perBatch.map((rows, index) => ({ index, feeds: { scans: rows } }));
}

interface Previewed {
  readonly connection: SqlConnection;
  readonly result: PreviewResult;
  rows(sql: string): Promise<unknown[][]>;
}

async function preview(
  files: Readonly<Record<string, string>>,
  delivered: readonly NightBatch[],
  retention = 2,
  replayBatch: number | null = null,
): Promise<Previewed> {
  const pipeline = await compileProject(files, FEEDS);
  const connection = await nativeConnection();
  const result = await runPreview(connection, {
    pipeline,
    batches: delivered,
    retention,
    replayBatch,
  });
  return {
    connection,
    result,
    rows: async (sql) => (await connection.query(sql)).rows.map((row) => [...row]),
  };
}

const THREE = batches([{ kid: "a", n: 1 }], [{ kid: "b", n: 2 }], [{ kid: "c", n: 3 }]);

describe("view", () => {
  it("is recomputed on read, so it reflects bronze after retention", async () => {
    const run = await preview({ "gold/kids.sql": "select kid from bronze.scans" }, THREE);
    expect(run.result.error).toBeNull();
    expect(await run.rows("select kid from gold.kids order by kid")).toEqual([["b"], ["c"]]);
  });

  it("survives a bronze type change between batches, because it is recreated every step", async () => {
    const run = await preview(
      { "gold/ns.sql": "select n from bronze.scans" },
      batches([{ n: 1 }], [{ n: "two" }]),
    );
    expect(run.result.error).toBeNull();
    expect(await run.rows("select n from gold.ns order by n")).toEqual([["1"], ["two"]]);
  });
});

describe("table", () => {
  it("is rebuilt in full after every batch and sees only what bronze retains", async () => {
    const run = await preview(
      {
        "gold/kids.sql":
          "{{ config(materialized='table') }} select count(*) as kids, max(_batch) as last from bronze.scans",
      },
      THREE,
      1,
    );
    expect(await run.rows("select kids, last from gold.kids")).toEqual([[1n, 2]]);
  });
});

describe("incremental", () => {
  const APPEND = `{{ config(materialized='incremental') }}
select kid, n, _batch from {{ new_batch('scans') }}`;

  it("appends each batch's rows when there is no unique_key, remembering what bronze forgot", async () => {
    const run = await preview({ "silver/seen.sql": APPEND }, THREE, 1);
    expect(await run.rows("select kid, _batch from silver.seen order by kid")).toEqual([
      ["a", 0],
      ["b", 1],
      ["c", 2],
    ]);
  });

  it("merges on unique_key, replacing rows whose key reappears", async () => {
    const run = await preview(
      {
        "silver/latest.sql": `{{ config(materialized='incremental', unique_key='kid') }}
select kid, n from {{ new_batch('scans') }}`,
      },
      batches(
        [
          { kid: "a", n: 1 },
          { kid: "b", n: 1 },
        ],
        [{ kid: "a", n: 2 }],
        [{ kid: "c", n: 1 }],
      ),
      1,
    );
    expect(await run.rows("select kid, n from silver.latest order by kid")).toEqual([
      ["a", 2n],
      ["b", 1n],
      ["c", 1n],
    ]);
  });

  it("merges on a composite key, compared case-insensitively", async () => {
    const run = await preview(
      {
        "silver/latest.sql": `{{ config(materialized='incremental', unique_key=['KID', 'Door']) }}
select kid, door, n from {{ new_batch('scans') }}`,
      },
      batches(
        [
          { kid: "a", door: 1, n: 1 },
          { kid: "a", door: 2, n: 1 },
        ],
        [{ kid: "a", door: 2, n: 5 }],
      ),
    );
    expect(await run.rows("select kid, door, n from silver.latest order by door")).toEqual([
      ["a", 1n, 1n],
      ["a", 2n, 5n],
    ]);
  });

  it("chooses the is_incremental branch and reads its own state through {{ this }}", async () => {
    const run = await preview(
      {
        "silver/running.sql": `{{ config(materialized='incremental', unique_key='id') }}
{% if is_incremental() %}
select 1 as id, (select total from {{ this }}) + sum(n) as total from {{ new_batch('scans') }}
{% else %}
select 1 as id, sum(n) as total from {{ new_batch('scans') }}
{% endif %}`,
      },
      THREE,
      1,
    );
    expect(await run.rows("select total from silver.running")).toEqual([[6n]]);
  });

  it("casts later batches to the state's types, matching columns by name in any order", async () => {
    const run = await preview(
      {
        "silver/seen.sql": `{{ config(materialized='incremental') }}
{% if is_incremental() %}
select cast(n as double) as n, kid from {{ new_batch('scans') }}
{% else %}
select kid, n from {{ new_batch('scans') }}
{% endif %}`,
      },
      batches([{ kid: "a", n: 1 }], [{ kid: "b", n: 2 }]),
    );
    expect(await run.rows("select typeof(n), kid, n from silver.seen order by kid")).toEqual([
      ["BIGINT", "a", 1n],
      ["BIGINT", "b", 2n],
    ]);
  });

  it("fails a step whose result has different columns from the state", async () => {
    const run = await preview(
      {
        "silver/seen.sql": `{{ config(materialized='incremental') }}
{% if is_incremental() %}
select kid, n as amount from {{ new_batch('scans') }}
{% else %}
select kid, n from {{ new_batch('scans') }}
{% endif %}`,
      },
      THREE,
    );
    expect(run.result.error).toMatchObject({
      code: "shape_mismatch",
      batch: 1,
      model: "silver.seen",
      phase: "step",
      message: expect.stringMatching(/adds `amount` and it is missing `n`/) as unknown,
    });
    expect(run.result.completed).toEqual([0]);
  });

  it("fails when a value cannot be cast to the state's type", async () => {
    const run = await preview(
      {
        "silver/seen.sql":
          "{{ config(materialized='incremental') }} select n from {{ new_batch('scans') }}",
      },
      batches([{ n: 1 }], [{ n: "two" }]),
    );
    expect(run.result.error).toMatchObject({ code: "sql", batch: 1, model: "silver.seen" });
    expect(run.result.error?.message).toMatch(/Could not convert string 'two'/);
  });

  it("rejects NULL keys, naming the column and the count", async () => {
    const run = await preview(
      {
        "silver/latest.sql": `{{ config(materialized='incremental', unique_key='kid') }}
select kid from {{ new_batch('scans') }}`,
      },
      batches([{ kid: "a" }, { kid: null }, { kid: null }]),
    );
    expect(run.result.error).toMatchObject({
      code: "null_key",
      batch: 0,
      message: "2 rows have NULL in the unique_key column `kid`.",
    });
  });

  it("rejects two rows of one batch's output with the same key, never picking a winner", async () => {
    const run = await preview(
      {
        "silver/latest.sql": `{{ config(materialized='incremental', unique_key='kid') }}
select kid, n from {{ new_batch('scans') }}`,
      },
      batches(
        [{ kid: "a", n: 1 }],
        [
          { kid: "b", n: 1 },
          { kid: "b", n: 2 },
        ],
      ),
    );
    expect(run.result.error).toMatchObject({
      code: "duplicate_key",
      batch: 1,
      message: "More than one row of this batch's output has the key (kid) = (b).",
    });
  });

  it("rejects a unique_key the output does not have", async () => {
    const run = await preview(
      {
        "silver/latest.sql": `{{ config(materialized='incremental', unique_key='house') }}
select kid from {{ new_batch('scans') }}`,
      },
      THREE,
    );
    expect(run.result.error).toMatchObject({ code: "missing_key_column", batch: 0 });
  });

  it("keeps its pre-step state when a step fails", async () => {
    const run = await preview(
      {
        "silver/latest.sql": `{{ config(materialized='incremental', unique_key='kid') }}
select kid, n from {{ new_batch('scans') }}`,
      },
      batches(
        [{ kid: "a", n: 1 }],
        [
          { kid: "a", n: 2 },
          { kid: "b", n: 1 },
          { kid: "b", n: 2 },
        ],
      ),
    );
    expect(run.result.error?.code).toBe("duplicate_key");
    expect(await run.rows("select kid, n from silver.latest")).toEqual([["a", 1n]]);
  });
});

describe("execution", () => {
  it("runs models in DAG order and stops at a runtime error, later models left at the batch before", async () => {
    const run = await preview(
      {
        "silver/a_first.sql": "{{ config(materialized='table') }} select n from bronze.scans",
        "gold/z_last.sql":
          "{{ config(materialized='table') }} select sum(n) as total from silver.a_first",
        "silver/b_broken.sql":
          "{{ config(materialized='table') }}\nselect n,\n  cast(kid as integer) as k from bronze.scans",
        "gold/y_after.sql":
          "{{ config(materialized='table') }} select count(*) as rows from silver.b_broken",
      },
      batches([{ kid: "1", n: 1 }], [{ kid: "x", n: 2 }]),
    );
    expect(run.result.error).toEqual({
      code: "sql",
      batch: 1,
      model: "silver.b_broken",
      phase: "step",
      message:
        "Conversion Error: Could not convert string 'x' to INT32 when casting from source column kid",
      line: 3,
      column: 3,
    });
    expect(await run.rows("select n from silver.a_first order by n")).toEqual([[1n], [2n]]);
    expect(await run.rows("select total from gold.z_last")).toEqual([[3n]]);
    expect(await run.rows("select rows from gold.y_after")).toEqual([[1n]]);
  });

  it("points a binder error at the model's rendered SQL", async () => {
    const run = await preview({ "gold/kids.sql": "select kid,\n  nope\nfrom bronze.scans" }, THREE);
    expect(run.result.error).toMatchObject({ code: "sql", batch: 0, line: 2, column: 3 });
    expect(run.result.error?.message).toMatch(/^Binder Error: Referenced column "nope" not found/);
  });

  it("delivers only the batches given, keeping true indices and counting retention over delivered batches", async () => {
    const all = batches([{ n: 0 }], [{ n: 1 }], [{ n: 2 }], [{ n: 3 }]);
    const visible = [all[0], all[3]].filter((batch) => batch !== undefined);
    const run = await preview({ "gold/seen.sql": "select n, _batch from bronze.scans" }, visible);
    expect(run.result).toEqual({ completed: [0, 3], error: null });
    expect(await run.rows("select n, _batch from gold.seen order by n")).toEqual([
      [0n, 0],
      [3n, 3],
    ]);
  });

  it("replays a batch: an append doubles its rows, a keyed merge does not", async () => {
    const run = await preview(
      {
        "silver/appended.sql":
          "{{ config(materialized='incremental') }} select kid from {{ new_batch('scans') }}",
        "silver/keyed.sql":
          "{{ config(materialized='incremental', unique_key='kid') }} select kid from {{ new_batch('scans') }}",
      },
      THREE,
      2,
      1,
    );
    expect(await run.rows("select kid from silver.appended order by kid")).toEqual([
      ["a"],
      ["b"],
      ["b"],
      ["c"],
    ]);
    expect(await run.rows("select kid from silver.keyed order by kid")).toEqual([
      ["a"],
      ["b"],
      ["c"],
    ]);
  });

  it("turns off external access for the player's SQL", async () => {
    const run = await preview({ "gold/kids.sql": "select kid from bronze.scans" }, THREE);
    await expect(run.connection.query("select * from read_csv('/etc/hostname')")).rejects.toThrow(
      /disabled by configuration/,
    );
  });

  it("fails a model that grows past the row limit", async () => {
    const run = await preview(
      {
        "gold/huge.sql": `{{ config(materialized='table') }}
select s.n from bronze.scans, (select unnest(range(${String(MAX_MODEL_ROWS + 1)})) as n) s`,
      },
      batches([{ kid: "a" }]),
    );
    expect(run.result.error).toMatchObject({ code: "row_limit", model: "gold.huge", batch: 0 });
  });

  async function timed(tick: number, count: number): Promise<Previewed> {
    const pipeline = await compileProject(
      { "gold/kids.sql": "{{ config(materialized='table') }} select n from bronze.scans" },
      FEEDS,
    );
    const connection = await nativeConnection();
    let clock = 0;
    const delivered = batches(...Array.from({ length: count }, (_, n) => [{ n }]));
    const result = await runPreview(
      connection,
      { pipeline, batches: delivered, retention: count },
      {
        now: () => {
          clock += tick;
          return clock;
        },
      },
    );
    return {
      connection,
      result,
      rows: async (sql) => (await connection.query(sql)).rows.map((row) => [...row]),
    };
  }

  it("fails a step that runs past its time limit, and rolls the step back", async () => {
    const run = await timed(11_000, 2);
    expect(run.result.error).toMatchObject({
      code: "step_time_limit",
      batch: 0,
      model: "gold.kids",
    });
    await expect(run.rows("select * from gold.kids")).rejects.toThrow(/does not exist/);
  });

  it("fails a night that runs past its time limit, at the step that crosses it", async () => {
    const run = await timed(9_000, 8);
    expect(run.result.error).toMatchObject({ code: "execution_time_limit", batch: 6 });
    expect(await run.rows("select max(n) from gold.kids")).toEqual([[5n]]);
  });
});
