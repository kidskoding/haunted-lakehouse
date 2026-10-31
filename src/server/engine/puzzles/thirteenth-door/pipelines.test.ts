import { describe, expect, it } from "vitest";
import { hashTable, tableFromRows } from "../../../../lib/canonical/hash";
import { judgeNight, runNight } from "../../../../lib/executor/night";
import { compileProject, nativeConnection } from "../../../../lib/executor/test-connection";
import type { ExpectedHashes } from "../../../../lib/executor/types";
import type { PuzzleData } from "../../puzzle";
import { generatePuzzle } from "../../registry";
import { BELL_BATCH } from "./delivery";
import { REFERENCE, WEIGHT_LOST_TRAP, type Project } from "./pipelines";
import { thirteenthDoor } from "./puzzle";

// Each seed's night replays seven batches through DuckDB, so give a seed room to run.
const NIGHT_TIMEOUT_MS = 30_000;
const SEEDS = Array.from({ length: 20 }, (_, i) => `seed-${String(i)}`);
const GOLD_COLUMNS = ["street", "cursed_houses"];
const FEEDS = Object.keys(generatePuzzle(thirteenthDoor, "seed-0").batches[0]?.feeds ?? {});

async function expectedHashes(data: PuzzleData): Promise<ExpectedHashes> {
  const hashes: Record<string, Record<string, string>> = {};
  for (const [checkpoint, tables] of Object.entries(data.expected)) {
    hashes[checkpoint] = {};
    for (const [table, rows] of Object.entries(tables)) {
      hashes[checkpoint][table] = await hashTable(tableFromRows(GOLD_COLUMNS, rows));
    }
  }
  return hashes;
}

async function play(project: Project, seed: string, replayBatch: number | null = null) {
  const data = generatePuzzle(thirteenthDoor, seed);
  const expected = await expectedHashes(data);
  const result = await runNight(
    await nativeConnection(),
    {
      pipeline: await compileProject(project, FEEDS),
      batches: data.batches,
      checkpoints: data.checkpoints,
      retention: thirteenthDoor.retention,
      goldTables: thirteenthDoor.goldTables,
      replayBatch,
    },
    { expected },
  );
  if (!result.started) throw new Error(`Missing gold: ${result.missingGold.join(", ")}`);
  return judgeNight(result.events, expected);
}

describe("the thirteenth door's pipelines", () => {
  it("reads every feed of the hour", () => {
    expect([...FEEDS].sort()).toEqual([
      "bowl_stock",
      "candy_bowls",
      "candy_catalog",
      "door_scans",
      "houses",
    ]);
  });

  it.each(SEEDS)(
    "the reference survives the bell and the proclamation, and a replayed bell (%s)",
    async (seed) => {
      expect(await play(REFERENCE, seed, BELL_BATCH)).toBeNull();
    },
    NIGHT_TIMEOUT_MS,
  );

  it.each(SEEDS)(
    "reading weight lost as pieces breaks at the bell (%s)",
    async (seed) => {
      expect(await play(WEIGHT_LOST_TRAP, seed)).toMatchObject({
        kind: "checkpoint",
        checkpointId: "bell",
        tables: ["gold.cursed_street"],
      });
    },
    NIGHT_TIMEOUT_MS,
  );
});
