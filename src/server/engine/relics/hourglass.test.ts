import { describe, expect, it } from "vitest";
import type { PuzzleData } from "../puzzle";
import { generatePuzzle } from "../registry";
import { fakePuzzle } from "../testing/fake-puzzle";
import { expectedRowCount, nextCheckpoint } from "./hourglass";

const puzzle = fakePuzzle();
const data = generatePuzzle(puzzle, "raven-pumpkin-13");

const code = (code: string) => expect.objectContaining({ code }) as Error;

/** The fake night with a known number of expected rows at each checkpoint. */
const counted: PuzzleData = {
  ...data,
  expected: {
    early: { "gold.totals": [{ total: 1 }] },
    late: { "gold.totals": [{ total: 1 }, { total: 2 }, { total: 3 }] },
  },
};

describe("nextCheckpoint", () => {
  it("is the first checkpoint before any failure", () => {
    expect(nextCheckpoint([], data).id).toBe("early");
  });

  it("is the checkpoint that broke last, since the ones before it passed", () => {
    expect(nextCheckpoint(["late"], data).id).toBe("late");
    expect(nextCheckpoint(["late", "early"], data).id).toBe("early");
  });

  it("refuses a failure at a checkpoint the night doesn't have", () => {
    expect(() => nextCheckpoint(["midnight"], data)).toThrow(code("unknown-checkpoint"));
  });
});

describe("expectedRowCount", () => {
  it("counts the expected rows at the given checkpoint", () => {
    expect(expectedRowCount(counted, puzzle.goldTables, "gold.totals", "early")).toEqual({
      table: "gold.totals",
      checkpointId: "early",
      label: "18:05",
      rowCount: 1,
    });
    expect(expectedRowCount(counted, puzzle.goldTables, "gold.totals", "late").rowCount).toBe(3);
  });

  it("leaks no expected values, only the count", () => {
    const count = expectedRowCount(counted, puzzle.goldTables, "gold.totals", "late");
    expect(Object.keys(count).sort()).toEqual(["checkpointId", "label", "rowCount", "table"]);
    expect(JSON.stringify(count)).not.toContain('total"');
  });

  it("refuses a table that isn't gold, and a checkpoint that doesn't exist", () => {
    expect(() => expectedRowCount(data, puzzle.goldTables, "bronze.readings", "early")).toThrow(
      code("unknown-table"),
    );
    expect(() => expectedRowCount(data, puzzle.goldTables, "gold.totals", "midnight")).toThrow(
      code("unknown-checkpoint"),
    );
  });
});
