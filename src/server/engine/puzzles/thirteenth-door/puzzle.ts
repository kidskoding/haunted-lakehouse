import "server-only";
import { scheduleBatches } from "../../batches/schedule";
import type { Checkpoint, Puzzle, PuzzleData } from "../../puzzle";
import { generateNight } from "../../world/night";
import { cursedHouses, mostCursedStreets } from "./cursed";
import { BATCH_COUNT, BELL_BATCH, deliveryPlan, LAST_BATCH } from "./delivery";
import { narrativeBindings } from "./narrative";

export const GOLD_TABLE = "gold.cursed_street";

/*
 * The answer is settled at the bell, so both checkpoints expect the same rows: the second
 * catches a pipeline that keeps counting the candy given out after 7pm.
 */
const CHECKPOINTS: readonly Checkpoint[] = [
  { id: "bell", afterBatch: BELL_BATCH, label: "19:00" },
  { id: "proclamation", afterBatch: LAST_BATCH, label: "19:15" },
];

/**
 * Slot 2, 6:45pm. A house that gave out exactly 13 pieces before the 7pm bell is cursed, and
 * the Mayor wants the street with the most cursed houses. Bowls report weight, not pieces.
 */
export const thirteenthDoor: Puzzle = {
  id: "thirteenth-door",
  slot: 2,
  title: "The Thirteenth Door",
  prerequisites: [],
  // Bronze keeps the whole hour: the reasoning here is about weight, not memory.
  retention: BATCH_COUNT,
  // Preview stops before the post-bell uploads; the proclamation still has to earn them.
  visibleBatchCount: BELL_BATCH + 1,
  goldTables: [GOLD_TABLE],
  // A scale that starts reporting "412 g", or renames its column, still says how much is left.
  possessable: [
    { feed: "candy_bowls", column: "weight_g", aliases: ["weight_grams", "grams"], unit: "g" },
  ],
  symptoms: ["scans_before_bell"],
  generate({ runSeed, rng }): PuzzleData {
    const night = generateNight(runSeed);
    const schedule = scheduleBatches(deliveryPlan(night), (...labels) => rng("batches", ...labels));
    const cursed = cursedHouses(night.candyBowls);
    const answer = mostCursedStreets(night.houses, cursed);
    return {
      batches: schedule.batches,
      checkpoints: CHECKPOINTS,
      expected: Object.fromEntries(CHECKPOINTS.map((c) => [c.id, { [GOLD_TABLE]: answer }])),
      narrative: narrativeBindings(night, cursed, answer),
    };
  },
};
