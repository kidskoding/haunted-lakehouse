import { describe, expect, it } from "vitest";
import type { CompiledPipeline } from "../pipeline/compile";
import { relationName } from "./connection";
import { runNight, type NightInput } from "./night";
import { reportError, reportFailure, reportNight } from "./report";
import { compileProject, nativeConnection } from "./test-connection";
import type { ExpectedHashes, NightBatch, NightEvent, RuntimeError } from "./types";

// The worked example of runtime contract section 12, broken in each way a night can break.

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

const LIT_HOUSES = `{{ config(materialized='view') }}
select house_id from silver.porch_state where state = 'on'
`;

const PASS = "798c0122e661b51aa92613caa56c876640a9c2eb9af0a858930cf1d0fd9a5166";
const C0 = "the expected hash at c0";
const EXPECTED: ExpectedHashes = {
  c0: { "gold.lit_houses": C0 },
  c1: { "gold.lit_houses": PASS },
};

const porch = (house_id: string, state: string, seq: number) => ({ house_id, state, seq });

const BATCHES: NightBatch[] = [
  [porch("h1", "on", 1), porch("h2", "on", 1)],
  [porch("h1", "off", 2), porch("h3", "on", 1)],
  [porch("h3", "off", 2), porch("h4", "on", 1)],
].map((rows, index) => ({ index, feeds: { porch_events: rows } }));

async function night(files: Readonly<Record<string, string>>, input: Partial<NightInput> = {}) {
  const pipeline = await compileProject(files, FEEDS);
  const result = await runNight(await nativeConnection(), {
    pipeline,
    batches: BATCHES,
    checkpoints: [{ id: "c1", afterBatch: 2, label: "8:00pm" }],
    retention: 2,
    goldTables: ["gold.lit_houses"],
    ...input,
  });
  if (!result.started) throw new Error("The night did not start.");
  return { pipeline, events: result.events };
}

/** The 1-based place of the first `text` in `source`. */
function placeOf(source: string, text: string) {
  const lines = source.slice(0, source.indexOf(text)).split("\n");
  return { line: lines.length, column: (lines.at(-1) ?? "").length + 1 };
}

describe("reportNight on real nights", () => {
  it("returns null when the night survives", async () => {
    const { pipeline, events } = await night({
      "silver/porch_state.sql": PORCH_STATE,
      "gold/lit_houses.sql": LIT_HOUSES,
    });
    expect(reportNight(events, EXPECTED, pipeline)).toBeNull();
  });

  it("names the checkpoint and table of a wrong answer, never the expected hash", async () => {
    const { pipeline, events } = await night({
      "gold/lit_houses.sql": `{{ config(materialized='table') }}
select house_id from bronze.porch_events
qualify row_number() over (partition by house_id order by seq desc) = 1 and state = 'on'
`,
    });
    const report = reportNight(events, EXPECTED, pipeline);
    expect(report).toEqual({
      kind: "checkpoint",
      checkpoint: { id: "c1", label: "8:00pm", afterBatch: 2 },
      tables: ["gold.lit_houses"],
      revealedBatch: 2,
    });
    expect(JSON.stringify(report)).not.toContain(PASS);
  });

  it("reports a flinch on the replay at the replay batch", async () => {
    const { pipeline, events } = await night(
      {
        "silver/porch_state.sql": `{{ config(materialized='incremental') }}
select house_id, arg_max(state, seq) as state, max(seq) as seq
from {{ new_batch('porch_events') }}
group by house_id
`,
        "gold/lit_houses.sql": LIT_HOUSES,
      },
      { replayBatch: 1 },
    );
    expect(reportNight(events, EXPECTED, pipeline)).toEqual({ kind: "replay", revealedBatch: 1 });
  });

  it("maps a runtime error in a model's later step back past its tags", async () => {
    // The config call spans lines that render to nothing, and `{{ this }}` renders longer.
    const source = PORCH_STATE.replace(
      "{{ config(materialized='incremental', unique_key='house_id') }}",
      "{{ config(\n  materialized='incremental',\n  unique_key='house_id',\n) }}",
    ).replace("(house_id)\nwhere t.seq is null", "(house_id) where t.nope is null");
    const { pipeline, events } = await night({
      "silver/porch_state.sql": source,
      "gold/lit_houses.sql": LIT_HOUSES,
    });
    const place = placeOf(source, "t.nope");
    expect(reportNight(events, EXPECTED, pipeline)).toMatchObject({
      kind: "error",
      error: {
        code: "sql",
        batch: 1,
        model: "silver.porch_state",
        path: "silver/porch_state.sql",
        phase: "step",
        ...place,
      },
      revealedBatch: 1,
    });
    const error = events[0]?.kind === "error" ? events[0].error : null;
    expect(error?.line).toBe(place.line - 3);
    const relation = relationName("silver", "porch_state");
    expect(error?.column).toBe(place.column - "{{ this }}".length + relation.length);
  });

  it("maps a runtime error in a first step past the config call on its line", async () => {
    const source = "{{ config(materialized='table') }} select nope from bronze.porch_events\n";
    const { pipeline, events } = await night({ "gold/lit_houses.sql": source });
    expect(reportNight(events, EXPECTED, pipeline)).toMatchObject({
      kind: "error",
      error: { batch: 0, path: "gold/lit_houses.sql", ...placeOf(source, "nope") },
      revealedBatch: 0,
    });
  });

  it("reports an error with no position as it is, with its model's file", async () => {
    const { pipeline, events } = await night({
      "gold/lit_houses.sql": "select cast(state as integer) as house_id from bronze.porch_events",
    });
    const report = reportNight(events, EXPECTED, pipeline);
    expect(report?.kind === "error" && report.error).toMatchObject({
      phase: "checkpoint",
      path: "gold/lit_houses.sql",
    });
    expect(report?.kind === "error" && "line" in report.error).toBe(false);
  });
});

describe("reportError", () => {
  const files = { "silver/porch_state.sql": PORCH_STATE, "gold/lit_houses.sql": LIT_HOUSES };
  const error: RuntimeError = {
    code: "sql",
    batch: 3,
    model: "silver.porch_state",
    phase: "step",
    message: "Binder Error",
    line: 8,
    column: 10,
  };
  let pipeline: CompiledPipeline | undefined;
  const compiled = async () => (pipeline ??= await compileProject(files, FEEDS));

  // Rendered line 8 is the if branch's `select l.* from latest l` once the model has state,
  // and the else branch's `select * from latest` on its first step; column 10 is `*` or `from`.
  const IF_BRANCH = placeOf(PORCH_STATE, "* from latest l");
  const ELSE_BRANCH = placeOf(PORCH_STATE, "from latest\n{% endif");

  it("renders a Preview's first visible batch as the model's first step", async () => {
    expect(reportError(error, await compiled(), 3)).toMatchObject(ELSE_BRANCH);
    expect(reportError(error, await compiled(), 0)).toMatchObject(IF_BRANCH);
  });

  it("renders the replay as a step with state, even on the first batch", async () => {
    const replay = reportError({ ...error, batch: 0, phase: "replay" }, await compiled(), 0);
    expect(replay).toMatchObject(IF_BRANCH);
  });

  it("drops a position it cannot place, and a model the pipeline does not have", async () => {
    const outside = reportError({ ...error, line: 40 }, await compiled(), 0);
    expect("line" in outside || "column" in outside).toBe(false);
    const unknown = reportError({ ...error, model: "silver.ghost" }, await compiled(), 0);
    expect(unknown).toEqual({
      code: "sql",
      batch: 3,
      model: "silver.ghost",
      path: null,
      phase: "step",
      message: "Binder Error",
    });
  });
});

describe("reportFailure", () => {
  const compiled = () =>
    compileProject(
      { "silver/porch_state.sql": PORCH_STATE, "gold/lit_houses.sql": LIT_HOUSES },
      FEEDS,
    );

  it("reports only the first failure, with neither the expected nor the actual hash", async () => {
    const events: NightEvent[] = [
      {
        kind: "checkpoint",
        checkpointId: "c0",
        label: "6:30pm",
        afterBatch: 0,
        hashes: { "gold.lit_houses": "the player's hash at c0" },
      },
      { kind: "replay", batch: 1, before: {}, after: { "gold.lit_houses": "changed" } },
    ];
    const report = reportNight(events, EXPECTED, await compiled());
    expect(report).toEqual({
      kind: "checkpoint",
      checkpoint: { id: "c0", label: "6:30pm", afterBatch: 0 },
      tables: ["gold.lit_houses"],
      revealedBatch: 0,
    });
    expect(JSON.stringify(report)).not.toMatch(/hash at c0/);
  });

  it("reports a flinch on the replay as its batch alone", async () => {
    const failure = { kind: "replay", revealedBatch: 2 } as const;
    expect(reportFailure(failure, await compiled())).toEqual(failure);
  });
});
