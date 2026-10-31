import { describe, expect, it } from "vitest";
import { judgeNight, runNight } from "../../lib/executor/night";
import { compileProject, nativeConnection } from "../../lib/executor/test-connection";
import type { Puzzle, PuzzleData } from "../engine/puzzle";
import { validatePuzzleData } from "../engine/puzzle";
import { expectedHashes } from "./expected";

// Nothing big has dropped by the first checkpoint, so the right gold table is empty there.
const DATA: PuzzleData = {
  batches: [
    { index: 0, arrivesAt: "18:00", feeds: { drops: [{ house: "a", pieces: 10 }] } },
    { index: 1, arrivesAt: "18:10", feeds: { drops: [{ house: "b", pieces: 70 }] } },
  ],
  checkpoints: [
    { id: "early", afterBatch: 0, label: "18:05" },
    { id: "late", afterBatch: 1, label: "18:15" },
  ],
  expected: {
    early: { "gold.big_drops": [] },
    late: { "gold.big_drops": [{ house: "b", pieces: 70 }] },
  },
  narrative: {},
};

const PUZZLE: Puzzle = {
  id: "big-drops",
  slot: 1,
  title: "Big Drops",
  prerequisites: [],
  retention: 2,
  visibleBatchCount: 1,
  goldTables: ["gold.big_drops"],
  goldColumns: { "gold.big_drops": ["house", "pieces"] },
  generate: () => DATA,
};

const REFERENCE = {
  "gold/big_drops.sql": `{{ config(materialized='view') }}
select house, pieces from bronze.drops where pieces > 50`,
};

async function night() {
  const expected = await expectedHashes(PUZZLE, DATA);
  const result = await runNight(
    await nativeConnection(),
    {
      pipeline: await compileProject(REFERENCE, ["drops"]),
      batches: DATA.batches,
      checkpoints: DATA.checkpoints,
      retention: PUZZLE.retention,
      goldTables: PUZZLE.goldTables,
      replayBatch: null,
    },
    { expected },
  );
  if (!result.started) throw new Error(`Missing gold: ${result.missingGold.join(", ")}`);
  return { expected, events: result.events };
}

describe("expectedHashes", () => {
  it("is valid puzzle data", () => {
    expect(validatePuzzleData(PUZZLE, DATA)).toEqual([]);
  });

  it("hashes an empty expected table as the player's empty gold view hashes", async () => {
    const { expected, events } = await night();
    const early = events.find((e) => e.kind === "checkpoint" && e.checkpointId === "early");
    if (early?.kind !== "checkpoint") throw new Error("the early checkpoint never ran");
    expect(early.hashes["gold.big_drops"]).toBe(expected.early?.["gold.big_drops"]);
  });

  it("lets a correct pipeline survive a checkpoint whose gold table is empty", async () => {
    const { expected, events } = await night();
    expect(judgeNight(events, expected)).toBeNull();
  });
});
