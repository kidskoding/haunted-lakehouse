import { describe, expect, it } from "vitest";
import { parseTemplate, type TemplateResult } from "./template";

const RULES = { tableDisabled: false };

function errorOf(result: TemplateResult): { code: string; at: number } {
  if (result.ok) throw new Error("Expected a template error.");
  return { code: result.error.code, at: result.error.at };
}

describe("parseTemplate", () => {
  it("defaults to a view and keeps plain SQL as one text piece", () => {
    expect(parseTemplate("select 1", RULES)).toEqual({
      ok: true,
      template: {
        config: { materialization: "view", uniqueKey: null },
        pieces: [{ kind: "text", text: "select 1", start: 0 }],
      },
    });
  });

  it("drops the config call and keeps the comments and whitespace before it", () => {
    const source = "-- porch state\n  -- {not a tag}\n{{ config(materialized='table') }}\nselect 1";
    const result = parseTemplate(source, RULES);
    expect(result).toEqual({
      ok: true,
      template: {
        config: { materialization: "table", uniqueKey: null },
        pieces: [
          { kind: "text", text: "-- porch state\n  -- {not a tag}\n", start: 0 },
          { kind: "text", text: "\nselect 1", start: source.indexOf("\nselect") },
        ],
      },
    });
  });

  it("reads this, new_batch, and an if block with its branches", () => {
    const source =
      "{{config(materialized='incremental')}}select * from {{ new_batch( 'Porch_Events' ) }}" +
      "{% if is_incremental() %} join {{ this }} {%else%} where true {% endif %}";
    const result = parseTemplate(source, RULES);
    if (!result.ok) throw new Error(result.error.message);
    expect(result.template.pieces).toEqual([
      { kind: "text", text: "select * from ", start: 38 },
      { kind: "new_batch", feed: "porch_events", start: 52, end: 85 },
      {
        kind: "if",
        then: [
          { kind: "text", text: " join ", start: 110 },
          { kind: "this", start: 116, end: 126 },
          { kind: "text", text: " ", start: 126 },
        ],
        otherwise: [{ kind: "text", text: " where true ", start: 135 }],
        start: 85,
        end: 158,
      },
    ]);
  });

  it("allows an if block without an else", () => {
    const source =
      "{{ config(materialized='incremental') }} select 1 {% if is_incremental() %}" +
      "from {{ this }}{% endif %}";
    const result = parseTemplate(source, RULES);
    expect(result.ok && result.template.pieces[1]).toMatchObject({ kind: "if", otherwise: [] });
  });

  it.each([
    ["select 1 {{ config() }}", "config_position", 9],
    ["/* c */ {{ config() }} select 1", "config_position", 8],
    ["-- {{ this }}\n{{ config() }} select 1", "incremental_only", 3],
    ["{{ config() }}{{ config() }} select 1", "config_duplicate", 14],
    ["{{ config(materialized='nope') }} select 1", "config_value", 23],
    ["select {{ ref('x') }}", "unknown_tag", 7],
    ["select {{ }}", "unknown_tag", 7],
    ["select {{ this() }}", "unknown_tag", 7],
    ["select {{ new_batch(feed) }}", "unknown_tag", 7],
    ["select {% for x in y %}", "unknown_tag", 7],
    ["select {% if true %}", "unknown_tag", 7],
    ["select {{ this", "template_syntax", 7],
    ["select {% if is_incremental() }}", "template_syntax", 7],
    ["select {{ $ }}", "template_syntax", 10],
    ["select 1 }}", "leftover_delimiter", 9],
    ["select '%}'", "leftover_delimiter", 8],
    ["select '{{ this }}'", "incremental_only", 8],
    ["select * from {{ new_batch('f') }}", "incremental_only", 14],
    ["select 1 {% if is_incremental() %} {% endif %}", "incremental_only", 9],
  ])("rejects %j with %s at %i", (source, code, at) => {
    expect(errorOf(parseTemplate(source, RULES))).toEqual({ code, at });
  });

  const incremental = "{{ config(materialized='incremental') }}";
  it.each([
    [`${incremental}{% if is_incremental() %}{% if is_incremental() %}`, 65],
    [`${incremental}select 1 {% else %}`, 49],
    [`${incremental}select 1 {% endif %}`, 49],
    [`${incremental}{% if is_incremental() %}{% else %}{% else %}{% endif %}`, 75],
    [`${incremental}select 1 {% if is_incremental() %}`, 49],
  ])("rejects the misplaced control tags in %j", (source, at) => {
    expect(errorOf(parseTemplate(source, RULES))).toEqual({ code: "template_syntax", at });
  });

  it.each([
    [`${incremental}select * from {{ this }}`, 54],
    [`${incremental}select 1 {% if is_incremental() %}{% else %}from {{ this }}{% endif %}`, 89],
  ])("rejects {{ this }} on the first step in %j", (source, at) => {
    expect(errorOf(parseTemplate(source, RULES))).toEqual({ code: "this_on_first_run", at });
  });
});
