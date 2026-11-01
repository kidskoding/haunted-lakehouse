import { describe, expect, it } from "vitest";
import { fakePuzzle } from "../testing/fake-puzzle";
import { generatePuzzle } from "../registry";
import { assertVisibleBatchCount, visibleBatches } from "./visibility";

const data = generatePuzzle(fakePuzzle({ visibleBatchCount: 2 }), "raven-pumpkin-13");

describe("assertVisibleBatchCount", () => {
  it("accepts every count from none through the full night", () => {
    for (let n = 0; n <= data.batches.length; n++) {
      expect(() => {
        assertVisibleBatchCount(data, n);
      }).not.toThrow();
    }
  });

  it.each([-1, 1.5, 4, Number.NaN])("rejects %j", (n) => {
    expect(() => {
      assertVisibleBatchCount(data, n);
    }).toThrow(RangeError);
  });
});

describe("visibleBatches", () => {
  it("returns only the preview prefix, leaving expected answers untouched", () => {
    const preview = visibleBatches(data, 2);
    expect(preview.map((b) => b.index)).toEqual([0, 1]);
    expect(preview).toEqual(data.batches.slice(0, 2));
    expect(data.batches).toHaveLength(3);
  });
});
