import { describe, expect, it } from "vitest";
import { generatePuzzle } from "../engine/registry";
import { fakePuzzle } from "../engine/testing/fake-puzzle";
import { previewBatches, serveBatch } from "./serve";

const puzzle = fakePuzzle({ visibleBatchCount: 2 });
const data = generatePuzzle(puzzle, "raven-pumpkin-13");

describe("previewBatches", () => {
  it("returns only the visible prefix", () => {
    expect(previewBatches(puzzle, data, []).map((b) => b.index)).toEqual([0, 1]);
  });

  it("adds the batches failed nights revealed, which then serve without an attempt", () => {
    expect(previewBatches(puzzle, data, [2]).map((b) => b.index)).toEqual([0, 1, 2]);
    expect(serveBatch(puzzle, data, [2], 2, false).ok).toBe(true);
  });
});

describe("serveBatch", () => {
  it("serves a visible batch without a night attempt", () => {
    const result = serveBatch(puzzle, data, [], 1, false);
    expect(result).toEqual({
      ok: true,
      batch: { index: 1, arrivesAt: data.batches[1]?.arrivesAt, feeds: data.batches[1]?.feeds },
    });
  });

  it("refuses a hidden batch until a night attempt is active", () => {
    expect(serveBatch(puzzle, data, [], 2, false)).toEqual({ ok: false, reason: "hidden" });
    const open = serveBatch(puzzle, data, [], 2, true);
    expect(open.ok).toBe(true);
    if (open.ok) expect(open.batch.index).toBe(2);
  });

  it("rejects an index that is not a batch tonight", () => {
    expect(serveBatch(puzzle, data, [], 9, true)).toEqual({ ok: false, reason: "unknown-batch" });
    expect(serveBatch(puzzle, data, [], 1.5, true)).toEqual({ ok: false, reason: "unknown-batch" });
  });
});
