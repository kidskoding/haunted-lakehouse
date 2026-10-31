import { describe, expect, it } from "vitest";
import { validatePuzzleData, type PuzzleData } from "./puzzle";
import { generatePuzzle } from "./registry";
import { fakePuzzle } from "./testing/fake-puzzle";

const puzzle = fakePuzzle();
const valid = generatePuzzle(puzzle, "raven-pumpkin-13");

function problemsWith(change: (data: PuzzleData) => PuzzleData): string[] {
  return validatePuzzleData(puzzle, change(valid));
}

describe("validatePuzzleData", () => {
  it("accepts consistent data", () => {
    expect(validatePuzzleData(puzzle, valid)).toEqual([]);
  });

  it.each<[string, (data: PuzzleData) => PuzzleData, RegExp]>([
    ["no batches", (d) => ({ ...d, batches: [], checkpoints: [] }), /no batches/],
    [
      "batches out of order",
      (d) => ({ ...d, batches: [...d.batches].reverse() }),
      /position 0 has index 2/,
    ],
    ["no checkpoints", (d) => ({ ...d, checkpoints: [], expected: {} }), /no checkpoints/],
    [
      "a checkpoint after the last batch",
      (d) => ({
        ...d,
        checkpoints: [{ id: "late", afterBatch: 3, label: "x" }],
        expected: { late: d.expected.late ?? {} },
      }),
      /late follows a batch that does not exist/,
    ],
    [
      "checkpoints out of order",
      (d) => ({ ...d, checkpoints: [...d.checkpoints].reverse() }),
      /early comes before/,
    ],
    [
      "a repeated checkpoint",
      (d) => ({
        ...d,
        checkpoints: [d.checkpoints[0], d.checkpoints[0], d.checkpoints[1]].filter(
          (c) => c !== undefined,
        ),
      }),
      /early appears twice/,
    ],
    [
      "a checkpoint with no expected state",
      (d) => ({ ...d, expected: { early: d.expected.early ?? {} } }),
      /late has no expected state/,
    ],
    [
      "a missing gold table",
      (d) => ({ ...d, expected: { ...d.expected, late: {} } }),
      /late has no expected gold.totals/,
    ],
    [
      "an undeclared gold table",
      (d) => ({
        ...d,
        expected: { ...d.expected, late: { ...d.expected.late, "gold.extra": [] } },
      }),
      /expects gold.extra, which is not a gold table/,
    ],
    [
      "expected state for no checkpoint",
      (d) => ({ ...d, expected: { ...d.expected, midnight: {} } }),
      /midnight matches no checkpoint/,
    ],
  ])("reports %s", (_, change, message) => {
    expect(problemsWith(change).join("\n")).toMatch(message);
  });
});
