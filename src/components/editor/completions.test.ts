import { describe, expect, it } from "vitest";
import { schemaFromRelations, templateOptions } from "./completions";
import type { EditorRelation } from "./types";

const relations: readonly EditorRelation[] = [
  { id: "bronze.porch_events", columns: ["house_id", "event_ts", "state"] },
  { id: "silver.porch_state", columns: ["house_id", "state"] },
  { id: "gold.welcoming_houses", columns: ["house_id", "lit"] },
];

describe("schemaFromRelations", () => {
  it("nests tables under their schema and also exposes them unqualified", () => {
    expect(schemaFromRelations(relations)).toEqual({
      bronze: { porch_events: ["house_id", "event_ts", "state"] },
      porch_events: ["house_id", "event_ts", "state"],
      silver: { porch_state: ["house_id", "state"] },
      porch_state: ["house_id", "state"],
      gold: { welcoming_houses: ["house_id", "lit"] },
      welcoming_houses: ["house_id", "lit"],
    });
  });

  it("skips ids that are not schema.table", () => {
    expect(schemaFromRelations([{ id: "orphan", columns: ["a"] }])).toEqual({});
  });
});

describe("templateOptions", () => {
  it("offers this, is_incremental, config, and a new_batch per bronze feed", () => {
    const labels = templateOptions(relations).map((option) => option.label);
    expect(labels).toContain("{{ this }}");
    expect(labels).toContain("is_incremental()");
    expect(labels).toContain("{{ new_batch('porch_events') }}");
    expect(labels.some((label) => label.includes("config(materialized='incremental'"))).toBe(true);
  });
});
