import { describe, expect, it } from "vitest";
import { hashTable, tableFromRows } from "../../../../lib/canonical/hash";
import { judgeNight, runNight } from "../../../../lib/executor/night";
import { compileProject, nativeConnection } from "../../../../lib/executor/test-connection";
import type { ExpectedHashes, NightFailure } from "../../../../lib/executor/types";
import type { PuzzleData } from "../../puzzle";
import { generatePuzzle } from "../../registry";
import { porchLights } from "./index";
import {
  ARRIVAL_ORDER_TRAP,
  EVER_ON_TRAP,
  REFERENCE,
  TUTORIAL_REFERENCE,
  type PipelineFiles,
} from "./pipelines";

// Each night runs on its own in-memory DuckDB; a native instance starts in milliseconds.

const SEEDS = Array.from({ length: 20 }, (_, i) => `seed-${String(i)}`);
const FEEDS = ["porch_lights"];

const runs = SEEDS.map((seed) => ({ seed, data: generatePuzzle(porchLights, seed) }));

async function expectedHashes(data: PuzzleData): Promise<ExpectedHashes> {
  const hashes: Record<string, Record<string, string>> = {};
  for (const [checkpoint, tables] of Object.entries(data.expected)) {
    const byTable: Record<string, string> = {};
    for (const [table, rows] of Object.entries(tables)) {
      byTable[table] = await hashTable(tableFromRows(["houses"], rows));
    }
    hashes[checkpoint] = byTable;
  }
  return hashes;
}

/** Runs the whole hour, hidden batches included, and returns the night's first failure. */
async function play(
  files: PipelineFiles,
  data: PuzzleData,
  retention = porchLights.retention,
): Promise<NightFailure | null> {
  const expected = await expectedHashes(data);
  const result = await runNight(
    await nativeConnection(),
    {
      pipeline: await compileProject(files, FEEDS),
      batches: data.batches,
      checkpoints: data.checkpoints,
      retention,
      goldTables: porchLights.goldTables,
      replayBatch: null,
    },
    { expected },
  );
  if (!result.started) throw new Error(`The night did not start: ${result.missingGold.join()}`);
  return judgeNight(result.events, expected);
}

/** The checkpoint a night broke at, or a description of how else it ended. */
function brokeAt(failure: NightFailure | null): string {
  if (failure === null) return "survived";
  return failure.kind === "checkpoint" ? failure.checkpointId : failure.kind;
}

describe("porch lights pipelines", () => {
  it.each(runs)("the incremental reference survives the night ($seed)", async ({ data }) => {
    expect(await play(REFERENCE, data)).toBeNull();
  });

  it.each(runs)(
    "the incremental reference survives even when bronze keeps one batch ($seed)",
    async ({ data }) => {
      expect(await play(REFERENCE, data, 1)).toBeNull();
    },
  );

  it.each(runs)("the tutorial view survives the night ($seed)", async ({ data }) => {
    expect(await play(TUTORIAL_REFERENCE, data)).toBeNull();
  });

  it.each(runs)(
    "counting every porch ever lit breaks by half past six ($seed)",
    async ({ data }) => {
      expect(["quarter-past", "half-past"]).toContain(brokeAt(await play(EVER_ON_TRAP, data)));
    },
  );

  it("trusting arrival order survives some nights and breaks a checkpoint on others", async () => {
    const outcomes = await Promise.all(
      runs.map(async ({ data }) => brokeAt(await play(ARRIVAL_ORDER_TRAP, data))),
    );
    for (const outcome of outcomes) {
      expect(["survived", "quarter-past", "half-past", "quarter-to"]).toContain(outcome);
    }
    expect(outcomes).toContain("survived");
    expect(outcomes.filter((outcome) => outcome !== "survived").length).toBeGreaterThan(0);
  });
});
