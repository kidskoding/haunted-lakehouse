import { beforeAll, describe, expect, it } from "vitest";
import {
  compile,
  MAX_MODEL_BYTES,
  MAX_MODELS,
  type CompileOptions,
  type CompileResult,
  type CompiledPipeline,
  type ModelFile,
} from "./compile";
import { render } from "./render";
import { nativeParser } from "./test-parsers";
import type { CompileError } from "./types";

let options: CompileOptions;

beforeAll(async () => {
  options = {
    parser: await nativeParser(),
    knownFeeds: ["porch_events", "door_scans", "bowl_weights"],
    hourFeeds: ["porch_events", "door_scans"],
  };
});

function files(models: Record<string, string>): ModelFile[] {
  return Object.entries(models).map(([path, source]) => ({ path, source }));
}

function pipelineOf(result: CompileResult): CompiledPipeline {
  if (!result.ok) throw new Error(JSON.stringify(result.errors, null, 2));
  return result.pipeline;
}

function errorsOf(result: CompileResult): readonly CompileError[] {
  if (result.ok) throw new Error("Expected compile errors.");
  return result.errors;
}

const INCREMENTAL = "{{ config(materialized='incremental', unique_key='house_id') }}\n";

describe("compile", () => {
  it("compiles models into typed records and an execution order", async () => {
    const pipeline = pipelineOf(
      await compile(
        files({
          "gold/lit.sql": "select house_id from silver.state where state = 'on'",
          "silver/state.sql":
            INCREMENTAL +
            "select * from {{ new_batch('porch_events') }}\n" +
            "{% if is_incremental() %}where seq > (select max(seq) from {{ this }}){% endif %}",
        }),
        options,
      ),
    );
    expect(pipeline.order).toEqual(["silver.state", "gold.lit"]);
    expect(pipeline.models).toMatchObject([
      {
        id: "gold.lit",
        schema: "gold",
        name: "lit",
        path: "gold/lit.sql",
        materialization: "view",
        uniqueKey: null,
        refs: ["silver.state"],
        feeds: [],
        active: true,
      },
      {
        id: "silver.state",
        schema: "silver",
        name: "state",
        path: "silver/state.sql",
        materialization: "incremental",
        uniqueKey: ["house_id"],
        refs: ["bronze.porch_events"],
        feeds: ["porch_events"],
        active: true,
      },
    ]);
  });

  it("returns models that render for the executor", async () => {
    const pipeline = pipelineOf(
      await compile(
        files({
          "silver/state.sql":
            INCREMENTAL +
            "select * from {{ new_batch('porch_events') }}" +
            "{% if is_incremental() %} anti join {{ this }} using (house_id){% endif %}",
        }),
        options,
      ),
    );
    const [model] = pipeline.models;
    if (!model) throw new Error("Expected a model.");
    const context = { thisRelation: "silver.state", newBatchRelation: (f: string) => `__hl.${f}` };
    expect(render(model, { ...context, isIncremental: false })).toBe(
      "\nselect * from __hl.porch_events",
    );
    expect(render(model, { ...context, isIncremental: true })).toBe(
      "\nselect * from __hl.porch_events anti join silver.state using (house_id)",
    );
  });

  it("collects references from both branches of an incremental model", async () => {
    const pipeline = pipelineOf(
      await compile(
        files({
          "silver/a.sql": "select 1 as id",
          "silver/b.sql":
            "{{ config(materialized='incremental') }}" +
            "{% if is_incremental() %}select id from silver.a" +
            "{% else %}select seq as id from bronze.door_scans{% endif %}",
        }),
        options,
      ),
    );
    expect(pipeline.models.find((m) => m.id === "silver.b")?.refs).toEqual([
      "bronze.door_scans",
      "silver.a",
    ]);
    expect(pipeline.order).toEqual(["silver.a", "silver.b"]);
  });

  it("marks models inactive when they need a feed outside the hour, and their dependents", async () => {
    const pipeline = pipelineOf(
      await compile(
        files({
          "silver/bowls.sql": "select * from bronze.bowl_weights",
          "gold/candy.sql": "select * from silver.bowls",
          "gold/doors.sql": "select * from bronze.door_scans",
          "gold/constant.sql": "select 13 as pieces",
        }),
        options,
      ),
    );
    expect(Object.fromEntries(pipeline.models.map((m) => [m.id, m.active]))).toEqual({
      "gold.candy": false,
      "gold.constant": true,
      "gold.doors": true,
      "silver.bowls": false,
    });
    expect(pipeline.order).toEqual(["gold.constant", "gold.doors", "silver.bowls", "gold.candy"]);
  });

  it("points errors at the line and column the player wrote, past rendered tags", async () => {
    const errors = errorsOf(
      await compile(
        files({
          "silver/state.sql":
            INCREMENTAL +
            "select * from {{ new_batch('porch_events') }} n\n" +
            "join visits v using (house_id)",
        }),
        options,
      ),
    );
    expect(errors).toEqual([
      {
        code: "invalid_reference",
        model: "silver.state",
        message: expect.stringContaining("`visits` is not a CTE") as unknown,
        line: 3,
        column: 6,
      },
    ]);
  });

  it("maps syntax errors back through the template too", async () => {
    const errors = errorsOf(
      await compile(
        files({
          "gold/x.sql": "{{ config(materialized='view') }}\n-- 🎃\nselect 1 from from",
        }),
        options,
      ),
    );
    expect(errors).toMatchObject([{ code: "syntax_error", model: "gold.x", line: 3, column: 15 }]);
  });

  it("checks references against the town's feeds and the project's models", async () => {
    const errors = errorsOf(
      await compile(
        files({
          "gold/x.sql":
            "select * from bronze.porch_event, silver.missing, gold.y, bronze.bowl_weights",
          "gold/y.sql":
            "{{ config(materialized='incremental') }}select * from {{ new_batch('pumpkins') }}",
        }),
        options,
      ),
    );
    expect(errors).toEqual([
      {
        code: "unknown_relation",
        model: "gold.x",
        message: "`bronze.porch_event` is not a feed.",
        line: 1,
        column: 15,
      },
      {
        code: "unknown_relation",
        model: "gold.x",
        message: "`silver.missing` is not a model in your pipeline.",
        line: 1,
        column: 35,
      },
      {
        code: "unknown_feed",
        model: "gold.y",
        message: "There is no feed named 'pumpkins'.",
        line: 1,
        column: 55,
      },
    ]);
  });

  it("reports errors from every model at once, models in schema.name order", async () => {
    const errors = errorsOf(
      await compile(
        files({
          "silver/b.sql": "select now()",
          "gold/a.sql": "delete from silver.b",
          "silver/a.sql": "{{ config(materialized='table', unique_key='id') }} select 1",
          "silver/ok.sql": "select 1",
        }),
        options,
      ),
    );
    expect(errors.map((e) => [e.model, e.code])).toEqual([
      ["gold.a", "not_a_query"],
      ["silver.a", "config_value"],
      ["silver.b", "forbidden_function"],
    ]);
  });

  it("reports an error once even when both renderings of a model hit it", async () => {
    const errors = errorsOf(
      await compile(
        files({
          "silver/s.sql":
            "{{ config(materialized='incremental') }}select random() as r " +
            "{% if is_incremental() %}, 1 as one{% else %}, 2 as one{% endif %}",
        }),
        options,
      ),
    );
    expect(errors).toMatchObject([{ code: "forbidden_function", line: 1, column: 48 }]);
  });

  it("rejects paths that are not silver/<name>.sql or gold/<name>.sql", async () => {
    const errors = errorsOf(
      await compile(
        files({
          "bronze/x.sql": "select 1",
          "silver/Visits.sql": "select 1",
          "silver/_private.sql": "select 1",
          "gold/x.txt": "select 1",
          "silver/a/b.sql": "select 1",
          [`silver/${"a".repeat(64)}.sql`]: "select 1",
        }),
        options,
      ),
    );
    expect(errors.map((e) => e.code)).toEqual(Array<string>(6).fill("invalid_path"));
    expect(errors[0]?.model).toBeNull();
  });

  it("accepts a model name of 63 characters and the same name in both schemas", async () => {
    const name = "a".repeat(63);
    const pipeline = pipelineOf(
      await compile(
        files({ [`silver/${name}.sql`]: "select 1", [`gold/${name}.sql`]: "select 1" }),
        options,
      ),
    );
    expect(pipeline.order).toEqual([`gold.${name}`, `silver.${name}`]);
  });

  it("rejects a model defined twice", async () => {
    const errors = errorsOf(
      await compile(
        [
          { path: "gold/x.sql", source: "select 1" },
          { path: "gold/x.sql", source: "select 2" },
        ],
        options,
      ),
    );
    expect(errors).toEqual([
      { code: "duplicate_model", model: "gold.x", message: "`gold.x` is defined twice." },
    ]);
  });

  it("enforces the model count and file size limits", async () => {
    const many = Array.from({ length: MAX_MODELS + 1 }, (_, i) => ({
      path: `silver/m${String(i)}.sql`,
      source: "select 1",
    }));
    expect(errorsOf(await compile(many, options)).map((e) => e.code)).toEqual(["too_many_models"]);
    expect((await compile(many.slice(0, MAX_MODELS), options)).ok).toBe(true);

    const padding = (bytes: number) => `select 1 -- ${"é".repeat(bytes / 2)}`;
    const big = await compile(files({ "gold/x.sql": padding(MAX_MODEL_BYTES) }), options);
    expect(errorsOf(big).map((e) => e.code)).toEqual(["model_too_large"]);
    const fits = await compile(files({ "gold/x.sql": padding(MAX_MODEL_BYTES - 16) }), options);
    expect(fits.ok).toBe(true);
  });

  it("applies The Purist's rule only when the character disables table", async () => {
    const project = files({ "gold/x.sql": "{{ config(materialized='table') }} select 1" });
    expect((await compile(project, options)).ok).toBe(true);
    expect(errorsOf(await compile(project, { ...options, tableDisabled: true }))).toEqual([
      {
        code: "materialization_disabled",
        model: "gold.x",
        message: "The Purist cannot use `table`. Use 'view' or 'incremental'.",
        line: 1,
        column: 24,
      },
    ]);
  });

  it("keeps template placeholders from clashing with names in the file", async () => {
    const pipeline = pipelineOf(
      await compile(
        files({
          "silver/s.sql":
            "{{ config(materialized='incremental') }}" +
            "select '__hl_tag0' as a from {{ new_batch('door_scans') }}" +
            "{% if is_incremental() %} where seq > (select max(seq) from {{ this }}){% endif %}",
        }),
        options,
      ),
    );
    expect(pipeline.models[0]?.refs).toEqual(["bronze.door_scans"]);
    const clash = await compile(files({ "silver/s.sql": "select * from __hl_tag0.this" }), options);
    expect(errorsOf(clash).map((e) => e.code)).toEqual(["invalid_reference"]);
  });

  it("gives the same result whatever order the files arrive in", async () => {
    const project = files({
      "silver/c.sql": "select * from silver.a",
      "gold/z.sql": "select * from silver.c, silver.b",
      "silver/a.sql": "select * from bronze.door_scans",
      "silver/b.sql": "select * from bronze.porch_events",
    });
    const forward = await compile(project, options);
    const backward = await compile([...project].reverse(), options);
    expect(backward).toEqual(forward);
    expect(pipelineOf(forward).order).toEqual(["silver.a", "silver.b", "silver.c", "gold.z"]);
  });
});

describe("compile cycles", () => {
  it("reports a model that reads itself with the hint to use {{ this }}", async () => {
    const errors = errorsOf(
      await compile(files({ "silver/visits.sql": "select * from\n  silver.visits" }), options),
    );
    expect(errors).toEqual([
      {
        code: "cycle",
        model: "silver.visits",
        message:
          "`silver.visits` reads itself: silver.visits → silver.visits. " +
          "Use {{ this }} to read your own state.",
        line: 2,
        column: 3,
      },
    ]);
  });

  it("reports exactly one cycle, the first a search in schema.name order finds", async () => {
    // The search starts at gold.report, which reaches the c-d cycle before a-b is visited.
    const project = files({
      "silver/d.sql": "select * from silver.c",
      "silver/c.sql": "select * from silver.d",
      "silver/b.sql": "select * from bronze.door_scans, silver.a",
      "silver/a.sql": "select 1 as id union all select * from silver.b",
      "gold/report.sql": "select * from silver.c",
    });
    const errors = errorsOf(await compile(project, options));
    expect(errors).toEqual([
      {
        code: "cycle",
        model: "silver.c",
        message: "These models read each other in a cycle: silver.c → silver.d → silver.c.",
        line: 1,
        column: 15,
      },
    ]);
    expect(await compile([...project].reverse(), options)).toEqual({ ok: false, errors });
  });

  it("does not count {{ this }} as an edge", async () => {
    const result = await compile(
      files({
        "silver/s.sql":
          "{{ config(materialized='incremental', unique_key='id') }}" +
          "select 1 as id {% if is_incremental() %}from {{ this }}{% endif %}",
      }),
      options,
    );
    expect(pipelineOf(result).models[0]?.refs).toEqual([]);
  });
});
