import { describe, expect, it } from "vitest";
import { formatSql } from "./format";

describe("formatSql", () => {
  it("puts each clause on its own line and lowercases reserved words", () => {
    const formatted = formatSql(
      "SELECT house_id, state FROM bronze.porch_events WHERE state = 'on' ORDER BY house_id",
    );
    expect(formatted).toBe(
      [
        "select",
        "  house_id,",
        "  state",
        "from bronze.porch_events",
        "where state = 'on'",
        "order by house_id",
        "",
      ].join("\n"),
    );
  });

  it("keeps template tags, strings, and comments as written", () => {
    const source = [
      "{{ config(materialized='incremental', unique_key='house_id') }}",
      "-- last known porch state",
      "select house_id, state from {{ new_batch('porch_events') }}",
      "",
    ].join("\n");
    const formatted = formatSql(source);
    expect(formatted).toContain("{{ config(materialized='incremental', unique_key='house_id') }}");
    expect(formatted).toContain("-- last known porch state");
    expect(formatted).toContain("{{ new_batch('porch_events') }}");
    expect(formatSql(formatted)).toBe(formatted);
  });

  it("is idempotent on an empty file", () => {
    expect(formatSql("")).toBe("");
  });
});
