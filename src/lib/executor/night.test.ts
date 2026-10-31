import { describe, expect, it } from "vitest";
import type { SqlConnection } from "./connection";
import { EXECUTION_TIME_LIMIT_MS } from "./execute";
import { judgeNight, runNight, runPreview, type NightInput } from "./night";
import { compileProject, nativeConnection } from "./test-connection";
import type { ExpectedHashes, NightBatch, NightEvent } from "./types";

// Runtime contract section 12, the worked example, run end to end.

const FEEDS = ["porch_events"];

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

const PASS = "798c0122e661b51aa92613caa56c876640a9c2eb9af0a858930cf1d0fd9a5166";
const TRAP = "b418caf918002698f13c7412ef67bb793ad1a3301fd7ee6e6793f8da8937a162";

const porch = (house_id: string, state: string, seq: number) => ({ house_id, state, seq });

const BATCHES: NightBatch[] = [
  [porch("h1", "on", 1), porch("h2", "on", 1)],
  [porch("h1", "off", 2), porch("h3", "on", 1)],
  [porch("h3", "off", 2), porch("h4", "on", 1)],
].map((rows, index) => ({ index, feeds: { porch_events: rows } }));

const EXPECTED: ExpectedHashes = { c1: { "gold.lit_houses": PASS } };

async function night(
  files: Readonly<Record<string, string>>,
  input: Partial<NightInput> = {},
  expected?: ExpectedHashes,
) {
  const pipeline = await compileProject(files, FEEDS);
  return runNight(
    await nativeConnection(),
    {
      pipeline,
      batches: BATCHES,
      checkpoints: [{ id: "c1", afterBatch: 2, label: "8:00pm" }],
      retention: 2,
      goldTables: ["gold.lit_houses"],
      ...input,
    },
    expected ? { expected } : {},
  );
}

function eventsOf(result: Awaited<ReturnType<typeof night>>): readonly NightEvent[] {
  if (!result.started) throw new Error("The night did not start.");
  return result.events;
}

describe("the worked example", () => {
  it("survives c1 with the reference pipeline, matching the spec's hash", async () => {
    const events = eventsOf(
      await night({ "silver/porch_state.sql": PORCH_STATE, "gold/lit_houses.sql": LIT_HOUSES }),
    );
    expect(events).toEqual([
      {
        kind: "checkpoint",
        checkpointId: "c1",
        label: "8:00pm",
        afterBatch: 2,
        hashes: { "gold.lit_houses": PASS },
      },
    ]);
    expect(judgeNight(events, EXPECTED)).toBeNull();
  });

  it("breaks at c1 with the trap, revealing batch 2", async () => {
    const events = eventsOf(await night({ "gold/lit_houses.sql": TRAP_LIT_HOUSES }));
    expect(events).toMatchObject([{ kind: "checkpoint", hashes: { "gold.lit_houses": TRAP } }]);
    expect(judgeNight(events, EXPECTED)).toEqual({
      kind: "checkpoint",
      checkpointId: "c1",
      label: "8:00pm",
      tables: ["gold.lit_houses"],
      revealedBatch: 2,
    });
  });

  it("holds through a replay of batch 2 when the merge is keyed", async () => {
    const events = eventsOf(
      await night(
        { "silver/porch_state.sql": PORCH_STATE, "gold/lit_houses.sql": LIT_HOUSES },
        { replayBatch: 2 },
      ),
    );
    expect(events.map((event) => event.kind)).toEqual(["replay", "checkpoint"]);
    expect(events[0]).toEqual({
      kind: "replay",
      batch: 2,
      before: { "gold.lit_houses": PASS },
      after: { "gold.lit_houses": PASS },
    });
    expect(judgeNight(events, EXPECTED)).toBeNull();
  });

  it("breaks at the replay when the model appends, before the checkpoint after it", async () => {
    const result = await night(
      { "silver/porch_state.sql": APPEND_PORCH_STATE, "gold/lit_houses.sql": LIT_HOUSES },
      { replayBatch: 2 },
    );
    const events = eventsOf(result);
    const replay = events[0];
    expect(replay?.kind === "replay" && replay.after).not.toEqual(
      replay?.kind === "replay" && replay.before,
    );
    expect(judgeNight(events, EXPECTED)).toEqual({ kind: "replay", revealedBatch: 2 });
  });
});

describe("Run the night", () => {
  const MORE_CHECKPOINTS = {
    checkpoints: [
      { id: "c0", afterBatch: 0, label: "6:30pm" },
      { id: "c1", afterBatch: 2, label: "8:00pm" },
    ],
  };
  const TRAP_FILES = { "gold/lit_houses.sql": TRAP_LIT_HOUSES };

  it("without expected hashes, hashes every checkpoint to the end of the night", async () => {
    const events = eventsOf(await night(TRAP_FILES, MORE_CHECKPOINTS));
    expect(events.map((event) => event.kind === "checkpoint" && event.checkpointId)).toEqual([
      "c0",
      "c1",
    ]);
  });

  it("with expected hashes, stops at the first failing checkpoint", async () => {
    const both = eventsOf(await night(TRAP_FILES, MORE_CHECKPOINTS));
    const c0 = both[0]?.kind === "checkpoint" ? both[0].hashes : {};
    const failsFirst = eventsOf(
      await night(TRAP_FILES, MORE_CHECKPOINTS, { c0: { "gold.lit_houses": "nope" }, ...EXPECTED }),
    );
    expect(failsFirst).toHaveLength(1);
    expect(judgeNight(failsFirst, { c0: { "gold.lit_houses": "nope" } })).toMatchObject({
      checkpointId: "c0",
      revealedBatch: 0,
    });
    const failsLater = eventsOf(await night(TRAP_FILES, MORE_CHECKPOINTS, { c0, ...EXPECTED }));
    expect(failsLater).toHaveLength(2);
    expect(judgeNight(failsLater, { c0, ...EXPECTED })).toMatchObject({ checkpointId: "c1" });
  });

  it("ends at a runtime error, which breaks the night at its batch", async () => {
    const events = eventsOf(
      await night(
        {
          "gold/lit_houses.sql":
            "{{ config(materialized='table') }} select cast(state as integer) as house_id from bronze.porch_events",
        },
        MORE_CHECKPOINTS,
      ),
    );
    expect(events).toMatchObject([
      { kind: "error", error: { code: "sql", batch: 0, model: "gold.lit_houses", phase: "step" } },
    ]);
    expect(judgeNight(events, EXPECTED)).toMatchObject({ kind: "error", revealedBatch: 0 });
  });

  it("reports a view that fails only when a checkpoint reads it", async () => {
    const events = eventsOf(
      await night({
        "gold/lit_houses.sql": "select cast(state as integer) as house_id from bronze.porch_events",
      }),
    );
    expect(events).toMatchObject([
      {
        kind: "error",
        error: { code: "sql", batch: 2, model: "gold.lit_houses", phase: "checkpoint" },
      },
    ]);
  });

  it("refuses to start at no cost when a gold table has no active model", async () => {
    expect(await night({ "silver/porch_state.sql": PORCH_STATE })).toEqual({
      started: false,
      missingGold: ["gold.lit_houses"],
    });
  });

  it("rejects a batch list that is not the whole night", async () => {
    await expect(night(TRAP_FILES, { batches: BATCHES.slice(1) })).rejects.toThrow(/0..B-1/);
  });

  it("rejects a night whose first batch leaves a feed empty", async () => {
    const silent = [{ index: 0, feeds: { porch_events: [] } }, ...BATCHES.slice(1)];
    await expect(night(TRAP_FILES, { batches: silent })).rejects.toThrow(/porch_events/);
  });

  it("runs every active model, so a broken leftover breaks the night", async () => {
    const events = eventsOf(
      await night({
        "silver/porch_state.sql": PORCH_STATE,
        "gold/lit_houses.sql": LIT_HOUSES,
        "silver/leftover.sql":
          "{{ config(materialized='table') }} select cast(house_id as integer) as n from bronze.porch_events",
      }),
    );
    expect(events).toMatchObject([{ kind: "error", error: { model: "silver.leftover" } }]);
  });

  it("counts the time a checkpoint spends reading gold towards the night's limit", async () => {
    // A view's step only creates it, so the clock jumps exactly when a checkpoint reads gold.
    const native = await nativeConnection();
    let clock = 0;
    const connection: SqlConnection = {
      run: (sql) => native.run(sql),
      query: (sql) => {
        if (sql.includes('"gold"')) clock += EXECUTION_TIME_LIMIT_MS + 1;
        return native.query(sql);
      },
    };
    const pipeline = await compileProject(
      {
        "gold/lit_houses.sql":
          "{{ config(materialized='view') }} select house_id from bronze.porch_events",
      },
      FEEDS,
    );
    const result = await runNight(
      connection,
      {
        pipeline,
        batches: BATCHES,
        checkpoints: [{ id: "c1", afterBatch: 2, label: "8:00pm" }],
        retention: 2,
        goldTables: ["gold.lit_houses"],
      },
      { now: () => clock },
    );
    expect(eventsOf(result)).toEqual([
      {
        kind: "error",
        error: expect.objectContaining({
          code: "execution_time_limit",
          phase: "checkpoint",
          model: "gold.lit_houses",
          batch: 2,
        }) as unknown,
      },
    ]);
  });
});

describe("Preview", () => {
  it("runs the visible batches without hashing, leaving the database to explore", async () => {
    const pipeline = await compileProject({ "gold/lit_houses.sql": TRAP_LIT_HOUSES }, FEEDS);
    const connection = await nativeConnection();
    const visible = BATCHES.slice(0, 2);
    expect(await runPreview(connection, { pipeline, batches: visible, retention: 2 })).toEqual({
      completed: [0, 1],
      error: null,
    });
    const { rows } = await connection.query("select house_id from gold.lit_houses order by 1");
    expect(rows).toEqual([["h2"], ["h3"]]);
  });
});
