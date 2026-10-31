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

  it("checks that the replay batch is one of the hour's batches", () => {
    expect(validatePuzzleData(fakePuzzle({ replayBatch: 1 }), valid)).toEqual([]);
    expect(validatePuzzleData(fakePuzzle({ replayBatch: 3 }), valid)).toEqual([
      "The replay batch 3 does not exist.",
    ]);
  });

  it("requires gold table names in lowercase, as the pipeline names its models", () => {
    const mixed = fakePuzzle({
      goldTables: ["gold.Totals"],
      goldColumns: { "gold.Totals": ["total"] },
    });
    const expected = Object.fromEntries(
      Object.entries(valid.expected).map(([id, tables]) => [
        id,
        { "gold.Totals": tables["gold.totals"] ?? [] },
      ]),
    );
    expect(validatePuzzleData(mixed, { ...valid, expected })).toEqual([
      "Gold table gold.Totals must be lowercase, as the pipeline names it gold.totals.",
    ]);
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
    ...[1.5, Number.NaN, -1].map(
      (afterBatch): [string, (data: PuzzleData) => PuzzleData, RegExp] => [
        `a checkpoint after batch ${String(afterBatch)}`,
        (d) => ({
          ...d,
          checkpoints: [{ id: "late", afterBatch, label: "x" }],
          expected: { late: d.expected.late ?? {} },
        }),
        /late follows a batch that does not exist/,
      ],
    ),
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
    [
      "an expected row with the wrong columns",
      (d) => ({ ...d, expected: { ...d.expected, late: { "gold.totals": [{ sum: 1 }] } } }),
      /late row 0 of gold.totals has columns sum, not total/,
    ],
  ])("reports %s", (_, change, message) => {
    expect(problemsWith(change).join("\n")).toMatch(message);
  });

  it.each<[string, Partial<Parameters<typeof fakePuzzle>[0]>, RegExp]>([
    ["a gold table without columns", { goldColumns: {} }, /gold.totals declares no columns/],
    [
      "columns for a table that is not gold",
      { goldColumns: { "gold.totals": ["total"], "gold.extra": ["x"] } },
      /declared for gold.extra, which is not a gold table/,
    ],
  ])("reports %s", (_, overrides, message) => {
    expect(validatePuzzleData(fakePuzzle(overrides), valid).join("\n")).toMatch(message);
  });
});
