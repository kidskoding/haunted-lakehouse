import { describe, expect, it } from "vitest";
import { hashTable, tableFromRows } from "../../../../lib/canonical/hash";
import { judgeNight, runNight } from "../../../../lib/executor/night";
import { compileProject, nativeConnection } from "../../../../lib/executor/test-connection";
import type { ExpectedHashes } from "../../../../lib/executor/types";
import { SHORT_MEMORY_RETENTION } from "../../curses/limits";
import type { PuzzleData } from "../../puzzle";
import { generatePuzzle } from "../../registry";
import { DISPUTE_UNCAST_TRAP, DROP_UNCAST_TRAP, REFERENCE, type Project } from "./pipelines";
import { FEED, GOLD_TABLE, possessedFeed } from "./puzzle";

// Each seed's night replays nine batches through DuckDB, so give a seed room to run.
const NIGHT_TIMEOUT_MS = 30_000;
const SEEDS = Array.from({ length: 20 }, (_, i) => `seed-${String(i)}`);
const GOLD_COLUMNS = ["item", "pieces", "disputed"];
// The last upload: the hidden spellings and the reorder have both landed by then.
const REPLAYED_BATCH = 8;

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

/** The first check after the quantities arrive as text, which the autopsy says a cast fails. */
function firstTextCheck(seed: string): string | undefined {
  const data = generatePuzzle(possessedFeed, seed);
  const retyped = data.batches.findIndex((batch) =>
    (batch.feeds[FEED] ?? []).some((row) => typeof row.quantity === "string"),
  );
  return data.checkpoints.find((c) => c.afterBatch >= retyped)?.id;
}

async function play(
  project: Project,
  seed: string,
  replayBatch: number | null = null,
  retention = possessedFeed.retention,
) {
  const data = generatePuzzle(possessedFeed, seed);
  const expected = await expectedHashes(data);
  const result = await runNight(
    await nativeConnection(),
    {
      pipeline: await compileProject(project, [FEED]),
      batches: data.batches,
      checkpoints: data.checkpoints,
      retention,
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

  it.each(SEEDS)(
    "the reference survives the Curse of Short Memory (%s)",
    async (seed) => {
      expect(await play(REFERENCE, seed, null, SHORT_MEMORY_RETENTION)).toBeNull();
    },
    NIGHT_TIMEOUT_MS,
  );

  // The retype lands before eight o'clock, and on some seeds before the first look.
  const traps = SEEDS.flatMap((seed) => [
    { trap: "disputing", project: DISPUTE_UNCAST_TRAP, seed },
    { trap: "dropping", project: DROP_UNCAST_TRAP, seed },
  ]);

  it.each(traps)(
    "$trap whatever a strict cast can't read breaks at the first check after the text ($seed)",
    async ({ project, seed }) => {
      const failure = await play(project, seed);
      if (failure?.kind !== "checkpoint") throw new Error(`Expected a checkpoint failure.`);
      expect(failure.tables).toEqual([GOLD_TABLE]);
      expect(["first-look", "eight-oclock"]).toContain(failure.checkpointId);
      expect(failure.checkpointId).toBe(firstTextCheck(seed));
    },
    NIGHT_TIMEOUT_MS,
  );
});
