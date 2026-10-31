import { describe, expect, it } from "vitest";
import { revealBatch } from "./reveal";

const BATCHES = [0, 1, 2, 3, 4].map((index) => ({ index }));

describe("revealBatch", () => {
  it("makes the revealed batch visible, keeping the batches hidden before it", () => {
    expect(revealBatch(BATCHES, [1, 0], { revealedBatch: 3 })).toEqual([0, 1, 3]);
  });

  it("changes nothing when the revealed batch was already visible", () => {
    expect(revealBatch(BATCHES, [0, 1], { revealedBatch: 1 })).toEqual([0, 1]);
  });

  it("accepts a failure report as well as a verdict", () => {
    const report = { kind: "replay", revealedBatch: 4 } as const;
    expect(revealBatch(BATCHES, [0], report)).toEqual([0, 4]);
  });

  it("rejects a batch the hour does not have", () => {
    expect(() => revealBatch(BATCHES, [0], { revealedBatch: 5 })).toThrow(RangeError);
    expect(() => revealBatch(BATCHES, [-1], { revealedBatch: 0 })).toThrow(RangeError);
  });
});
