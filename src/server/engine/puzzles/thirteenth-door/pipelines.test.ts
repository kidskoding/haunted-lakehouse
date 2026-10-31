import { describe, expect, it } from "vitest";
import { hashTable, tableFromRows } from "../../../../lib/canonical/hash";
import { judgeNight, runNight } from "../../../../lib/executor/night";
import { compileProject, nativeConnection } from "../../../../lib/executor/test-connection";
import type { ExpectedHashes } from "../../../../lib/executor/types";
import { SHORT_MEMORY_RETENTION } from "../../curses/limits";
import { drawPossession, possess } from "../../curses/possession";
import type { PuzzleData } from "../../puzzle";
import { generateContext, generatePuzzle } from "../../registry";
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

interface Night {
  readonly data?: PuzzleData;
  readonly replayBatch?: number | null;
  readonly retention?: number;
}

async function play(project: Project, seed: string, night: Night = {}) {
  const {
    data = generatePuzzle(thirteenthDoor, seed),
    replayBatch = null,
    retention = thirteenthDoor.retention,
  } = night;
  const expected = await expectedHashes(data);
  const result = await runNight(
    await nativeConnection(),
    {
      pipeline: await compileProject(project, FEEDS),
      batches: data.batches,
      checkpoints: data.checkpoints,
      retention,
      goldTables: thirteenthDoor.goldTables,
      replayBatch,
    },
    { expected },
  );
  if (!result.started) throw new Error(`Missing gold: ${result.missingGold.join(", ")}`);
  return judgeNight(result.events, expected);
}

/*
 * What a player who has met the possessed scale writes: the weight from whichever column
 * holds it, with any unit stripped. Bronze keeps every column it has seen, so the regex
 * always matches weight_g; the aliases join once the vendor renames it.
 */
const POSSESSED_WEIGHT =
  "cast(regexp_extract(cast(coalesce(*columns('^(weight_g|weight_grams|grams)$')) as varchar), '^-?[0-9.]+') as double)";
const BOWL_TAKINGS = REFERENCE["silver/bowl_takings.sql"] ?? "";
const POSSESSION_PROOF: Project = {
  ...REFERENCE,
  "silver/bowl_takings.sql": BOWL_TAKINGS.replace(
    "select b.device_id, b.seq, b.weight_g,",
    // A function, so the regex's `$` is not read as a replacement pattern.
    () => `select b.device_id, b.seq, ${POSSESSED_WEIGHT} as weight_g,`,
  ),
};

describe("the thirteenth door's pipelines", () => {
  it("adapts the reference's reading of the weight for possession", () => {
    expect(POSSESSION_PROOF["silver/bowl_takings.sql"]).not.toBe(BOWL_TAKINGS);
  });

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
      expect(await play(REFERENCE, seed, { replayBatch: BELL_BATCH })).toBeNull();
    },
    NIGHT_TIMEOUT_MS,
  );

  it.each(SEEDS)(
    "the reference survives the Curse of Short Memory (%s)",
    async (seed) => {
      expect(await play(REFERENCE, seed, { retention: SHORT_MEMORY_RETENTION })).toBeNull();
    },
    NIGHT_TIMEOUT_MS,
  );

  it.each(SEEDS)(
    "the reference, reading the weight however the scale spells it, survives possession (%s)",
    async (seed) => {
      const data = generatePuzzle(thirteenthDoor, seed);
      const possession = drawPossession(
        thirteenthDoor,
        data,
        generateContext(thirteenthDoor, seed),
      );
      if (!possession) throw new Error("The hour declares a possessable column.");
      expect(
        await play(POSSESSION_PROOF, seed, {
          data: possess(data, possession),
          replayBatch: BELL_BATCH,
        }),
      ).toBeNull();
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
