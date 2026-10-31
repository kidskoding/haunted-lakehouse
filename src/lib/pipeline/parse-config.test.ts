import { describe, expect, it } from "vitest";
import { parseConfig, type ConfigResult } from "./parse-config";
import { tokenizeTag } from "./tag-tokens";

function config(content: string, tableDisabled = false): ConfigResult {
  const tokenized = tokenizeTag(content, 0);
  if (!tokenized.ok) throw new Error(tokenized.message);
  return parseConfig(tokenized.tokens, content.length, { tableDisabled });
}

function errorOf(result: ConfigResult): { code: string; at: number } {
  if (result.ok) throw new Error("Expected a config error.");
  return { code: result.error.code, at: result.error.at };
}

describe("parseConfig", () => {
  it.each([
    ["config()", { materialization: "view", uniqueKey: null }],
    ["config(materialized='table')", { materialization: "table", uniqueKey: null }],
    ['config(materialized="view",)', { materialization: "view", uniqueKey: null }],
    ["config(materialized='incremental')", { materialization: "incremental", uniqueKey: null }],
    [
      "config(materialized='incremental', unique_key='house_id')",
      { materialization: "incremental", uniqueKey: ["house_id"] },
    ],
    [
      "config(\n  unique_key = ['House_Id', \"hour\",],\n  materialized = 'incremental'\n)",
      { materialization: "incremental", uniqueKey: ["House_Id", "hour"] },
    ],
  ])("reads %j", (content, expected) => {
    expect(config(content)).toEqual({ ok: true, config: expected });
  });

  it.each([
    ["config", "config_syntax", 6],
    ["config(materialized)", "config_syntax", 19],
    ["config(materialized=view)", "config_syntax", 20],
    ["config(materialized='view'", "config_syntax", 26],
    ["config(materialized='view' unique_key='a')", "config_syntax", 27],
    ["config(materialized='view')x", "config_syntax", 27],
    ["config(,)", "config_syntax", 7],
    ["config(materialized='incremental', unique_key=[])", "config_syntax", 47],
    ["config(materialized='incremental', unique_key=['a' 'b'])", "config_syntax", 51],
    ["config(materialised='view')", "config_argument", 7],
    ["config(materialized='view', materialized='table')", "config_argument", 28],
    ["config(materialized='ephemeral')", "config_value", 20],
    ["config(materialized='VIEW')", "config_value", 20],
    ["config(unique_key='id')", "config_value", 7],
    ["config(materialized='table', unique_key='id')", "config_value", 29],
    ["config(materialized='incremental', unique_key=['a', 'A'])", "config_value", 52],
    ["config(materialized='incremental', unique_key='')", "config_value", 46],
  ])("rejects %j with %s at %i", (content, code, at) => {
    expect(errorOf(config(content))).toEqual({ code, at });
  });

  it("disables `table` for The Purist and nothing else", () => {
    expect(errorOf(config("config(materialized='table')", true))).toEqual({
      code: "materialization_disabled",
      at: 20,
    });
    expect(config("config(materialized='incremental')", true).ok).toBe(true);
    expect(config("config()", true).ok).toBe(true);
  });
});

describe("tokenizeTag", () => {
  it("offsets token positions and rejects characters outside the grammar", () => {
    expect(tokenizeTag(" this ", 10)).toEqual({
      ok: true,
      tokens: [{ kind: "ident", value: "this", start: 11 }],
    });
    expect(tokenizeTag("new_batch('a\"b')", 0)).toMatchObject({
      ok: true,
      tokens: [{}, {}, { kind: "string", value: 'a"b' }, {}],
    });
    expect(tokenizeTag("a + b", 0)).toEqual({ ok: false, message: "Unexpected `+`.", at: 2 });
    expect(tokenizeTag("'open", 3)).toEqual({
      ok: false,
      message: "The string is never closed.",
      at: 3,
    });
  });
});
