import { describe, expect, it } from "vitest";
import { eventFromRow, rowFromEvent } from "./events";

describe("run event rows", () => {
  it("round-trips an hour_opened event", () => {
    const event = {
      kind: "hour_opened" as const,
      slot: 1 as const,
      puzzleId: "porch-lights",
      curse: null,
    };
    const row = rowFromEvent(event);
    expect(row).toEqual({
      kind: "hour_opened",
      payload: { slot: 1, puzzleId: "porch-lights", curse: null },
    });
    expect(eventFromRow(row.kind, row.payload)).toEqual(event);
  });

  it.each<[string, Record<string, unknown>]>([
    ["no revealedBatch", { slot: 1, checkpointId: "late" }],
    ["a fractional revealedBatch", { slot: 1, checkpointId: "late", revealedBatch: 1.5 }],
    ["a string revealedBatch", { slot: 1, checkpointId: "late", revealedBatch: "2" }],
  ])("reads a legacy attempt_failed with %s as revealing nothing", (_, payload) => {
    expect(eventFromRow("attempt_failed", payload)).toEqual({
      kind: "attempt_failed",
      slot: 1,
      checkpointId: "late",
      revealedBatch: null,
    });
  });

  it("rejects an unknown kind or a payload that repeats kind", () => {
    expect(() => eventFromRow("not-a-kind", {})).toThrow(/Unknown/);
    expect(() => eventFromRow("run_abandoned", { kind: "run_abandoned" })).toThrow(/repeat/);
    expect(() => eventFromRow("run_abandoned", null)).toThrow(/object payload/);
  });
});
