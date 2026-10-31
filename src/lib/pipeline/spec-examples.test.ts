import { beforeAll, describe, expect, it } from "vitest";
import { compile, type CompileOptions } from "./compile";
import { render } from "./render";
import { nativeParser } from "./test-parsers";
import type { CompileErrorCode } from "./types";

// Every rule of docs/pipeline-runtime.md section 2 that the compiler decides, as one table.

let options: CompileOptions;

beforeAll(async () => {
  options = {
    parser: await nativeParser(),
    knownFeeds: ["porch_events", "door_scans"],
    hourFeeds: ["porch_events", "door_scans"],
  };
});

/** Section 12's worked example. */
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

const TRAP_LIT_HOUSES = `{{ config(materialized='table') }}
select house_id from bronze.porch_events
qualify row_number() over (partition by house_id order by seq desc) = 1 and state = 'on'
`;

interface Compiles {
  readonly rule: string;
  readonly files: Readonly<Record<string, string>>;
  readonly order: readonly string[];
}

interface Fails {
  readonly rule: string;
  readonly files: Readonly<Record<string, string>>;
  readonly error: CompileErrorCode;
  readonly message?: string;
}

const INC = "{{ config(materialized='incremental') }}";

const COMPILES: readonly Compiles[] = [
  {
    rule: "12: the worked example orders porch_state before lit_houses",
    files: { "silver/porch_state.sql": PORCH_STATE, "gold/lit_houses.sql": LIT_HOUSES },
    order: ["silver.porch_state", "gold.lit_houses"],
  },
  {
    rule: "12: the trap, a table straight over bronze, compiles (it fails at a checkpoint)",
    files: { "gold/lit_houses.sql": TRAP_LIT_HOUSES },
    order: ["gold.lit_houses"],
  },
  {
    rule: "2.1: silver.visits and gold.visits may coexist",
    files: {
      "silver/visits.sql": "select 1 as n",
      "gold/visits.sql": "select * from silver.visits",
    },
    order: ["silver.visits", "gold.visits"],
  },
  {
    rule: "2.2: leading whitespace and -- comments may precede the config call",
    files: {
      "gold/x.sql":
        "\n  -- the Mayor's dashboard\n\n{{ config( materialized = 'table' ) }} select 1",
    },
    order: ["gold.x"],
  },
  {
    rule: "2.2: the config call is optional and defaults to a view",
    files: { "gold/x.sql": "select 1" },
    order: ["gold.x"],
  },
  {
    rule: "2.2: one trailing semicolon, then only whitespace or comments",
    files: { "gold/x.sql": "select 1;\n-- end\n" },
    order: ["gold.x"],
  },
  {
    rule: "2.2: VALUES, FROM-first, and set operations are queries",
    files: {
      "silver/a.sql": "values (1), (2)",
      "silver/b.sql": "from silver.a",
      "silver/c.sql": "select * from silver.a union select * from silver.b",
    },
    order: ["silver.a", "silver.b", "silver.c"],
  },
  {
    rule: "2.4: CTE names are allowed unqualified",
    files: { "gold/x.sql": "with t as (select * from bronze.door_scans) select * from t" },
    order: ["gold.x"],
  },
  {
    rule: "2.4: matching is case-insensitive",
    files: {
      "silver/a.sql": "select 1",
      "gold/b.sql": 'select * from SILVER.A, "Bronze"."Door_Scans"',
    },
    order: ["silver.a", "gold.b"],
  },
  {
    rule: "2.4: Kahn's algorithm takes the ready model first by schema.name",
    files: {
      "silver/z.sql": "select 1",
      "silver/m.sql": "select 1",
      "gold/a.sql": "select * from silver.z",
      "gold/b.sql": "select 1",
    },
    order: ["gold.b", "silver.m", "silver.z", "gold.a"],
  },
];

const FAILS: readonly Fails[] = [
  {
    rule: "2.1: models cannot live in bronze",
    files: { "bronze/door_scans.sql": "select 1" },
    error: "invalid_path",
  },
  {
    rule: "2.1: names starting with _ are reserved",
    files: { "silver/_x.sql": "select 1" },
    error: "invalid_path",
  },
  {
    rule: "2.2: a config call after SQL text",
    files: { "gold/x.sql": "select 1 {{ config(materialized='table') }}" },
    error: "config_position",
  },
  {
    rule: "2.2: a second config call",
    files: { "gold/x.sql": "{{ config() }}\n{{ config() }} select 1" },
    error: "config_duplicate",
  },
  {
    rule: "2.2: an unknown argument",
    files: { "gold/x.sql": "{{ config(schema='gold') }} select 1" },
    error: "config_argument",
  },
  {
    rule: "2.2: an argument given twice",
    files: { "gold/x.sql": "{{ config(materialized='view', materialized='view') }} select 1" },
    error: "config_argument",
  },
  {
    rule: "2.2: an unknown materialization",
    files: { "gold/x.sql": "{{ config(materialized='ephemeral') }} select 1" },
    error: "config_value",
  },
  {
    rule: "2.2: unique_key without incremental",
    files: { "gold/x.sql": "{{ config(unique_key='id') }} select 1 as id" },
    error: "config_value",
  },
  {
    rule: "2.2: a key column listed twice, case-insensitively",
    files: {
      "gold/x.sql":
        "{{ config(materialized='incremental', unique_key=['id','ID']) }} select 1 as id",
    },
    error: "config_value",
  },
  {
    rule: "2.3: tags are recognized inside SQL strings",
    files: { "gold/x.sql": "select '{{ whatever }}' as s" },
    error: "unknown_tag",
  },
  {
    rule: "2.3: {{ this }} only in incremental models",
    files: { "gold/x.sql": "select * from {{ this }}" },
    error: "incremental_only",
  },
  {
    rule: "2.3: new_batch names a feed that exists",
    files: { "silver/x.sql": `${INC}select * from {{ new_batch('pumpkins') }}` },
    error: "unknown_feed",
  },
  {
    rule: "2.3: if blocks do not nest",
    files: {
      "silver/x.sql": `${INC}select 1 {% if is_incremental() %}{% if is_incremental() %}{% endif %}{% endif %}`,
    },
    error: "template_syntax",
  },
  {
    rule: "2.3: an endif without an if",
    files: { "silver/x.sql": `${INC}select 1 {% endif %}` },
    error: "template_syntax",
  },
  {
    rule: "2.3: delimiters left after rendering",
    files: { "gold/x.sql": 'select 1 as "}}"' },
    error: "leftover_delimiter",
  },
  {
    rule: "5.3: {{ this }} with no state on the first batch",
    files: { "silver/x.sql": `${INC}select * from {{ this }}` },
    error: "this_on_first_run",
    message:
      "`{{ this }}` has no state on the first batch; read it only inside " +
      "`{% if is_incremental() %}`.",
  },
  {
    rule: "2.4: an unqualified name that is not a CTE",
    files: { "gold/x.sql": "select * from door_scans" },
    error: "invalid_reference",
  },
  {
    rule: "2.4: a three-part name",
    files: { "gold/x.sql": "select * from memory.bronze.door_scans" },
    error: "invalid_reference",
  },
  {
    rule: "2.4: another schema",
    files: { "gold/x.sql": "select * from main.door_scans" },
    error: "invalid_reference",
  },
  {
    rule: "2.4: a table function in FROM",
    files: { "gold/x.sql": "select * from generate_series(1, 3)" },
    error: "table_function",
  },
  {
    rule: "2.4: a feed that does not exist",
    files: { "gold/x.sql": "select * from bronze.pumpkins" },
    error: "unknown_relation",
  },
  {
    rule: "2.4: a model that does not exist",
    files: { "gold/x.sql": "select * from silver.visits" },
    error: "unknown_relation",
  },
  {
    rule: "2.4: a model that names itself is a cycle, with the hint",
    files: { "silver/visits.sql": "select * from silver.visits" },
    error: "cycle",
    message:
      "`silver.visits` reads itself: silver.visits → silver.visits. " +
      "Use {{ this }} to read your own state.",
  },
  {
    rule: "2.4: cycles print as a → b → a",
    files: { "silver/a.sql": "select * from silver.b", "silver/b.sql": "select * from silver.a" },
    error: "cycle",
    message: "These models read each other in a cycle: silver.a → silver.b → silver.a.",
  },
  {
    rule: "2.5: DDL",
    files: { "gold/x.sql": "create table gold.y as select 1" },
    error: "not_a_query",
  },
  {
    rule: "2.5: DML",
    files: { "gold/x.sql": "update silver.y set a = 1" },
    error: "not_a_query",
  },
  {
    rule: "2.5: more than one statement",
    files: { "gold/x.sql": "select 1; select 2" },
    error: "multiple_statements",
  },
  {
    rule: "2.5: functions that read files",
    files: { "gold/x.sql": "select read_blob('x')" },
    error: "forbidden_function",
  },
  {
    rule: "2.5: functions that make results volatile",
    files: { "gold/x.sql": "select gen_random_uuid()" },
    error: "forbidden_function",
  },
  {
    rule: "2.5: catalog functions",
    files: { "gold/x.sql": "select * from duckdb_columns()" },
    error: "table_function",
  },
  {
    rule: "2.5: information_schema",
    files: { "gold/x.sql": "select * from information_schema.columns" },
    error: "invalid_reference",
  },
];

describe("runtime contract section 2", () => {
  it.each(COMPILES)("$rule", async ({ files, order }) => {
    const result = await compile(
      Object.entries(files).map(([path, source]) => ({ path, source })),
      options,
    );
    expect(result).toMatchObject({ ok: true, pipeline: { order } });
  });

  it.each(FAILS)("$rule", async ({ files, error, message }) => {
    const result = await compile(
      Object.entries(files).map(([path, source]) => ({ path, source })),
      options,
    );
    expect(result.ok).toBe(false);
    const errors = result.ok ? [] : result.errors;
    expect(errors.map((e) => e.code)).toEqual([error]);
    if (message !== undefined) expect(errors[0]?.message).toBe(message);
  });

  it("12: compiles and renders the worked example exactly", async () => {
    const result = await compile(
      [
        { path: "silver/porch_state.sql", source: PORCH_STATE },
        { path: "gold/lit_houses.sql", source: LIT_HOUSES },
      ],
      options,
    );
    if (!result.ok) throw new Error(JSON.stringify(result.errors));
    const [lit, state] = result.pipeline.models;
    expect(state).toMatchObject({
      id: "silver.porch_state",
      materialization: "incremental",
      uniqueKey: ["house_id"],
      refs: ["bronze.porch_events"],
      feeds: ["porch_events"],
      active: true,
    });
    expect(lit).toMatchObject({
      id: "gold.lit_houses",
      materialization: "view",
      refs: ["silver.porch_state"],
    });
    if (!state) throw new Error("Expected silver.porch_state.");
    const context = {
      thisRelation: "silver.porch_state",
      newBatchRelation: (feed: string) => `__hl.new_batch_${feed}`,
    };
    const later = render(state, { ...context, isIncremental: true });
    expect(later).toContain("from __hl.new_batch_porch_events\n");
    expect(later).toContain("left join silver.porch_state t using (house_id)");
    expect(later).not.toContain("select * from latest");
    const first = render(state, { ...context, isIncremental: false });
    expect(first).toContain("\nselect * from latest\n");
    expect(first).not.toContain("silver.porch_state");
  });
});
