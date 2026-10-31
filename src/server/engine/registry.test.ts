import { describe, expect, it } from "vitest";
import { validatePuzzleData, type Puzzle } from "./puzzle";
import { createPuzzleRegistry, generatePuzzle } from "./registry";
import type { Slot } from "./slots";
import { fakePuzzle } from "./testing/fake-puzzle";

const at = (slot: number) => slot as Slot;

describe("createPuzzleRegistry", () => {
  it("pools puzzles by slot, ordered by id whatever the registration order", () => {
    const registry = createPuzzleRegistry([
      fakePuzzle({ id: "wren", slot: at(2) }),
      fakePuzzle({ id: "apple", slot: at(2) }),
      fakePuzzle({ id: "porch", slot: at(1) }),
    ]);
    expect(registry.pool(at(2)).map((p) => p.id)).toEqual(["apple", "wren"]);
    expect(registry.pool(at(1)).map((p) => p.id)).toEqual(["porch"]);
    expect(registry.pool(at(10))).toEqual([]);
    expect(registry.get("wren")?.slot).toBe(2);
    expect(registry.get("missing")).toBeUndefined();
  });

  it.each<[string, Puzzle[], RegExp]>([
    ["duplicate ids", [fakePuzzle(), fakePuzzle()], /share the id fake/],
    ["no retention", [fakePuzzle({ retention: 0 })], /at least one batch/],
    ["fractional retention", [fakePuzzle({ retention: 1.5 })], /at least one batch/],
    [
      "no visible batches",
      [fakePuzzle({ visibleBatchCount: 0 })],
      /at least one batch before the night/,
    ],
    [
      "fractional visible batches",
      [fakePuzzle({ visibleBatchCount: 1.5 })],
      /at least one batch before the night/,
    ],
    ["an unknown prerequisite", [fakePuzzle({ prerequisites: ["ghost"] })], /not registered/],
    [
      "a prerequisite in the same slot",
      [
        fakePuzzle({ id: "a", slot: at(8) }),
        fakePuzzle({ id: "b", slot: at(8), prerequisites: ["a"] }),
      ],
      /not in an earlier slot/,
    ],
    [
      "a prerequisite in a later slot",
      [
        fakePuzzle({ id: "a", slot: at(9) }),
        fakePuzzle({ id: "b", slot: at(8), prerequisites: ["a"] }),
      ],
      /not in an earlier slot/,
    ],
  ])("rejects %s", (_, puzzles, message) => {
    expect(() => createPuzzleRegistry(puzzles)).toThrow(message);
  });

  it("accepts a prerequisite from an earlier slot", () => {
    const registry = createPuzzleRegistry([
      fakePuzzle({ id: "co-op", slot: at(8) }),
      fakePuzzle({ id: "witching", slot: at(9), prerequisites: ["co-op"] }),
    ]);
    expect(registry.pool(at(9))).toHaveLength(1);
  });
});

describe("generatePuzzle", () => {
  it("produces valid data, the same for the same seed", () => {
    const puzzle = fakePuzzle();
    const data = generatePuzzle(puzzle, "raven-pumpkin-13");
    expect(validatePuzzleData(puzzle, data)).toEqual([]);
    expect(generatePuzzle(puzzle, "raven-pumpkin-13")).toEqual(data);
  });

  it("keys streams by puzzle, run seed, and slot", () => {
    const base = generatePuzzle(fakePuzzle(), "raven-pumpkin-13");
    expect(generatePuzzle(fakePuzzle(), "raven-pumpkin-14")).not.toEqual(base);
    expect(generatePuzzle(fakePuzzle({ id: "other" }), "raven-pumpkin-13")).not.toEqual(base);
    expect(generatePuzzle(fakePuzzle({ slot: at(2) }), "raven-pumpkin-13")).not.toEqual(base);
  });
});
