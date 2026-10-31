import { beforeAll, describe, expect, it } from "vitest";
import { analyzeQuery, type QueryAnalysis } from "./extract-refs";
import { nativeParser } from "./test-parsers";
import type { SqlParser } from "./types";

let parser: SqlParser;

beforeAll(async () => {
  parser = await nativeParser();
});

async function analyze(sql: string, ignored: readonly string[] = []): Promise<QueryAnalysis> {
  return analyzeQuery(sql, await parser(sql), new Set(ignored));
}

async function refsOf(sql: string): Promise<string[]> {
  const analysis = await analyze(sql);
  expect(analysis.issues).toEqual([]);
  return [...new Set(analysis.refs.map((ref) => `${ref.schema}.${ref.name}`))].sort();
}

async function issuesOf(sql: string): Promise<{ code: string; at: number | null }[]> {
  const analysis = await analyze(sql);
  return analysis.issues.map(({ code, at }) => ({ code, at }));
}

describe("analyzeQuery references", () => {
  it.each([
    ["select * from bronze.door_scans", ["bronze.door_scans"]],
    [
      "select * from silver.visits v join gold.houses h using (house_id) " +
        "left join bronze.porch_events p on p.house_id = v.house_id",
      ["bronze.porch_events", "gold.houses", "silver.visits"],
    ],
    [
      "select house_id from silver.visits where house_id in (select house_id from gold.cursed) " +
        "and exists (select 1 from bronze.bowls b where b.house_id = house_id)",
      ["bronze.bowls", "gold.cursed", "silver.visits"],
    ],
    [
      "select (select count(*) from silver.visits) as n from (select * from bronze.door_scans) d",
      ["bronze.door_scans", "silver.visits"],
    ],
    [
      "select * from silver.a union all select * from silver.b except select * from gold.c",
      ["gold.c", "silver.a", "silver.b"],
    ],
    ['select * from "Silver"."Visits", BRONZE.Door_Scans', ["bronze.door_scans", "silver.visits"]],
    ['select * from "silver"."odd ""name"""', ['silver.odd "name"']],
    ["from silver.visits", ["silver.visits"]],
    ["values (1), (2)", []],
    ["select 1", []],
    [
      "select * from silver.visits, lateral (select house_id) l, (values (1)) v(a)",
      ["silver.visits"],
    ],
  ])("finds what %j reads", async (sql, expected) => {
    expect(await refsOf(sql)).toEqual(expected);
  });

  it("lets CTE names stand unqualified, in later CTEs, recursively, and in subqueries", async () => {
    const sql = `
      with recursive latest as (select * from bronze.porch_events),
      Lit as (select * from latest where state = 'on'),
      hours(h) as (select 18 union all select h + 1 from hours where h < 26)
      select * from lit, hours where exists (select 1 from latest)`;
    expect(await refsOf(sql)).toEqual(["bronze.porch_events"]);
  });

  it("keeps a CTE's name out of scope for queries outside its WITH", async () => {
    expect(await issuesOf("select * from (with x as (select 1) select * from x) a, x")).toEqual([
      { code: "invalid_reference", at: 56 },
    ]);
  });

  it("reads a qualified name as a relation even when a CTE has the same name", async () => {
    expect(await refsOf("with visits as (select 1) select * from silver.visits, visits")).toEqual([
      "silver.visits",
    ]);
  });

  it("skips relations in placeholder schemas", async () => {
    const analysis = await analyze('select * from "__hl_tag0".this, silver.a', ["__hl_tag0"]);
    expect(analysis).toMatchObject({ issues: [], refs: [{ schema: "silver", name: "a" }] });
  });

  it("locates references in the parsed SQL, counting UTF-8 bytes back to code units", async () => {
    const sql = "select 'café 🎃' as label from silver.visits";
    const analysis = await analyze(sql);
    expect(analysis.refs).toEqual([
      { schema: "silver", name: "visits", at: sql.indexOf("silver.visits") },
    ]);
  });
});

describe("analyzeQuery rejections", () => {
  it.each([
    ["select * from visits", "invalid_reference", 14],
    ["select * from 'porch.csv'", "invalid_reference", 14],
    ["select * from main.visits", "invalid_reference", 14],
    ["select * from information_schema.tables", "invalid_reference", 14],
    ["select * from __hl.new_batch", "invalid_reference", 14],
    ["select * from lake.silver.visits", "invalid_reference", 14],
    ["select * from range(3)", "table_function", 14],
    ["select * from read_csv('x.csv')", "table_function", 14],
    ["select * from duckdb_tables()", "table_function", 14],
    ["select random() from silver.a", "forbidden_function", 7],
    ["select NOW()", "forbidden_function", 7],
    ["select main.uuid()", "forbidden_function", 7],
    ["select read_text('x')", "forbidden_function", 7],
    ["select parquet_metadata('x')", "forbidden_function", 7],
    ["select pg_catalog.pg_typeof(1)", "forbidden_function", 7],
    ["select current_date", "forbidden_function", 7],
    ["select 1 where localtimestamp > '2026-10-31'", "forbidden_function", 15],
    ["select count(*) filter (where random() < 0.5) from silver.a", "forbidden_function", 30],
    ["select row_number() over (order by random())", "forbidden_function", 35],
    ["describe silver.visits", "not_a_query", null],
    ["summarize silver.visits", "not_a_query", null],
    ["create table silver.x as select 1", "not_a_query", null],
    ["insert into silver.x select 1", "not_a_query", null],
    ["delete from silver.x", "not_a_query", null],
    ["drop table silver.x", "not_a_query", null],
    ["copy silver.x to 'out.csv'", "not_a_query", null],
    ["set threads = 4", "not_a_query", null],
    ["attach 'lake.db'", "not_a_query", null],
    ["pragma version", "not_a_query", null],
    ["pivot silver.visits on hour using count(*)", "not_a_query", null],
    ["select 1; select 2", "multiple_statements", null],
    ["", "no_query", null],
    ["-- only a comment", "no_query", null],
    ["selec 1", "syntax_error", 0],
    ["select 'héllo 🎃', from from", "syntax_error", 24],
  ])("rejects %j with %s at %j", async (sql, code, at) => {
    expect(await issuesOf(sql)).toEqual([{ code, at }]);
  });

  it("allows column names that only look like forbidden functions", async () => {
    expect(await refsOf("select v.current_date, now_playing, randomness from silver.v")).toEqual([
      "silver.v",
    ]);
  });

  it("allows a trailing semicolon and comments after it", async () => {
    expect(await refsOf("select * from silver.a; -- done\n")).toEqual(["silver.a"]);
  });

  it("reports every problem in a query, not only the first", async () => {
    expect(await issuesOf("select random() from visits, range(2)")).toEqual([
      { code: "forbidden_function", at: 7 },
      { code: "invalid_reference", at: 21 },
      { code: "table_function", at: 29 },
    ]);
  });

  it("explains the problems in the player's terms", async () => {
    const analysis = await analyze("select now() from visits");
    expect(analysis.issues.map((issue) => issue.message)).toEqual([
      "`now` is not allowed in a model: its result changes from run to run.",
      "`visits` is not a CTE of this query. Name relations with their schema: " +
        "bronze.visits, silver.visits, or gold.visits.",
    ]);
  });
});
