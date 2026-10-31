import { describe, expect, it } from "vitest";
import { generatePuzzle } from "../../server/engine/registry";
import { fakePuzzle } from "../../server/engine/testing/fake-puzzle";
import { hashTable, tableFromRows } from "../canonical/hash";
import { judgeNight, runNight } from "./night";
import { compileProject, nativeConnection } from "./test-connection";
import type { ExpectedHashes } from "./types";

// End to end: compile a small multi-model pipeline and run the fake puzzle's night through it.

const puzzle = fakePuzzle();
const SEEDS = ["raven-pumpkin-13", "moth-lantern-7", "crow-candle-21", "bat-cider-4", "owl-mist-9"];

const REFERENCE = {
  "silver/readings_log.sql": `{{ config(materialized='incremental', unique_key=['_batch', '_seq']) }}
select _batch, _seq, value from {{ new_batch('readings') }}`,
  "gold/totals.sql": `{{ config(materialized='view') }}
select sum(value) as total from silver.readings_log`,
};

const APPENDING = {
  ...REFERENCE,
  "silver/readings_log.sql": `{{ config(materialized='incremental') }}
select _batch, _seq, value from {{ new_batch('readings') }}`,
};

const TRAP = {
  "gold/totals.sql": `{{ config(materialized='table') }}
select sum(value) as total from bronze.readings`,
};

async function expectedHashes(seed: string): Promise<ExpectedHashes> {
  const { expected } = generatePuzzle(puzzle, seed);
  const hashes: Record<string, Record<string, string>> = {};
  for (const [checkpoint, tables] of Object.entries(expected)) {
    hashes[checkpoint] = {};
    for (const [table, rows] of Object.entries(tables)) {
      hashes[checkpoint][table] = await hashTable(tableFromRows(["total"], rows));
    }
  }
  return hashes;
}

async function play(files: Readonly<Record<string, string>>, seed: string, replayBatch?: number) {
  const data = generatePuzzle(puzzle, seed);
  const expected = await expectedHashes(seed);
  const result = await runNight(
    await nativeConnection(),
    {
      pipeline: await compileProject(files, ["readings"]),
      batches: data.batches,
      checkpoints: data.checkpoints,
      retention: puzzle.retention,
      goldTables: puzzle.goldTables,
      replayBatch: replayBatch ?? null,
    },
    { expected },
  );
  if (!result.started) throw new Error("The night did not start.");
  return judgeNight(result.events, expected);
}

describe("the fake puzzle, end to end", () => {
  it.each(SEEDS)(
    "the reference pipeline survives every checkpoint and a replay (%s)",
    async (seed) => {
      expect(await play(REFERENCE, seed, 1)).toBeNull();
    },
  );

  it.each(SEEDS)("a table over bronze breaks once retention forgets batch 0 (%s)", async (seed) => {
    expect(await play(TRAP, seed)).toMatchObject({ kind: "checkpoint", checkpointId: "late" });
  });

  it.each(SEEDS)(
    "an appending log survives without a replay and breaks at one (%s)",
    async (seed) => {
      expect(await play(APPENDING, seed)).toBeNull();
      expect(await play(APPENDING, seed, 1)).toEqual({ kind: "replay", revealedBatch: 1 });
    },
  );
});
