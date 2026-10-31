import { describe, expect, it } from "vitest";
import { judgeNight, runNight } from "../../../../lib/executor/night";
import { compileProject, nativeConnection } from "../../../../lib/executor/test-connection";
import { expectedHashes } from "../../../batches/expected";
import { generatePuzzle } from "../../registry";
import { DISPUTE_UNCAST_TRAP, DROP_UNCAST_TRAP, REFERENCE, type Project } from "./pipelines";
import { FEED, GOLD_TABLE, possessedFeed } from "./puzzle";

// Each seed's night replays nine batches through DuckDB, so give a seed room to run.
const NIGHT_TIMEOUT_MS = 30_000;
const SEEDS = Array.from({ length: 20 }, (_, i) => `seed-${String(i)}`);
// The last upload: the hidden spellings and the reorder have both landed by then.
const REPLAYED_BATCH = 8;

async function play(project: Project, seed: string, replayBatch: number | null = null) {
  const data = generatePuzzle(possessedFeed, seed);
  const expected = await expectedHashes(possessedFeed, data);
  const result = await runNight(
    await nativeConnection(),
    {
      pipeline: await compileProject(project, [FEED]),
      batches: data.batches,
      checkpoints: data.checkpoints,
      retention: possessedFeed.retention,
      goldTables: possessedFeed.goldTables,
      replayBatch,
    },
    { expected },
  );
  if (!result.started) throw new Error(`Missing gold: ${result.missingGold.join(", ")}`);
  return judgeNight(result.events, expected);
}

describe("the possessed feed's pipelines", () => {
  it.each(SEEDS)(
    "the reference survives every possession, and a replayed last upload (%s)",
    async (seed) => {
      expect(await play(REFERENCE, seed, REPLAYED_BATCH)).toBeNull();
    },
    NIGHT_TIMEOUT_MS,
  );

  // Every spelling kind has landed by seven o'clock; on some seeds the retype beats the first look.
  const traps = SEEDS.flatMap((seed) => [
    { trap: "disputing", project: DISPUTE_UNCAST_TRAP, seed },
    { trap: "dropping", project: DROP_UNCAST_TRAP, seed },
  ]);

  it.each(traps)(
    "$trap whatever a strict cast can't read breaks by seven o'clock ($seed)",
    async ({ project, seed }) => {
      const failure = await play(project, seed);
      if (failure?.kind !== "checkpoint") throw new Error(`Expected a checkpoint failure.`);
      expect(failure.tables).toEqual([GOLD_TABLE]);
      expect(["first-look", "seven-oclock"]).toContain(failure.checkpointId);
    },
    NIGHT_TIMEOUT_MS,
  );
});
