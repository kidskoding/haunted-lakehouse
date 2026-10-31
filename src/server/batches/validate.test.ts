import { describe, expect, it } from "vitest";
import { generatePuzzle } from "../engine/registry";
import { porchLights } from "../engine/puzzles/porch-lights";
import { expectedHashes } from "./expected";
import { validateNight } from "./validate";

describe("validateNight", () => {
  it("survives when every checkpoint hash matches", async () => {
    const data = generatePuzzle(porchLights, "raven-pumpkin-13");
    const expected = await expectedHashes(data);
    expect(validateNight(data.checkpoints, expected, expected)).toEqual({ survived: true });
  });

  it("returns only the first failing checkpoint", async () => {
    const data = generatePuzzle(porchLights, "raven-pumpkin-13");
    const expected = await expectedHashes(data);
    const first = data.checkpoints[0];
    const second = data.checkpoints[1];
    if (!first || !second) throw new Error("porch lights needs checkpoints");

    const broken: Record<string, Record<string, string>> = { ...expected };
    const wrong = "0".repeat(64);
    broken[first.id] = Object.fromEntries(
      Object.keys(expected[first.id] ?? {}).map((table) => [table, wrong]),
    );
    broken[second.id] = Object.fromEntries(
      Object.keys(expected[second.id] ?? {}).map((table) => [table, wrong]),
    );

    expect(validateNight(data.checkpoints, expected, broken)).toEqual({
      survived: false,
      checkpointId: first.id,
      revealedBatch: first.afterBatch,
    });
  });

  it("treats a missing checkpoint submission as a failure at that checkpoint", async () => {
    const data = generatePuzzle(porchLights, "raven-pumpkin-13");
    const expected = await expectedHashes(data);
    const first = data.checkpoints[0];
    if (!first) throw new Error("porch lights needs a checkpoint");
    const rest = Object.fromEntries(Object.entries(expected).filter(([id]) => id !== first.id));
    expect(validateNight(data.checkpoints, expected, rest)).toEqual({
      survived: false,
      checkpointId: first.id,
      revealedBatch: first.afterBatch,
    });
  });
});
