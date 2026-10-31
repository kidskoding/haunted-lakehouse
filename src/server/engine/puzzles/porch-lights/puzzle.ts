import "server-only";
import { scheduleBatches } from "../../batches/schedule";
import type { Puzzle, PuzzleData } from "../../puzzle";
import { generateNight } from "../../world/night";
import { GOLD_TABLE, lastWords, welcomingHouses } from "./gold";
import { narrativeBindings } from "./narrative";
import { BATCH_COUNT, checkpoints, deliveryPlan, hourEvents, type CheckpointId } from "./plan";

/**
 * Slot 1, the tutorial: how many houses are welcoming trick-or-treaters each time the Mayor
 * looks, from a feed of porch-light changes in which a few sensors die without a word.
 */
export const porchLights: Puzzle = {
  id: "porch-lights",
  slot: 1,
  title: "Porch Lights",
  prerequisites: [],
  retention: BATCH_COUNT,
  // The last two landings stay hidden so running the night still has something to reveal.
  visibleBatchCount: BATCH_COUNT - 2,
  goldTables: [GOLD_TABLE],
  generate({ runSeed, rng }): PuzzleData {
    const night = generateNight(runSeed);
    const events = hourEvents(night.porchLights.events);
    const schedule = scheduleBatches(deliveryPlan(events), (...labels) =>
      rng("batches", ...labels),
    );
    const hourCheckpoints = checkpoints(schedule.landings);

    const welcoming = new Map<CheckpointId, readonly string[]>(
      hourCheckpoints.map(({ id, afterBatch }) => [
        id,
        welcomingHouses(lastWords(events, schedule.arrivals, afterBatch)),
      ]),
    );

    return {
      batches: schedule.batches,
      checkpoints: hourCheckpoints,
      expected: Object.fromEntries(
        [...welcoming].map(([id, houses]) => [id, { [GOLD_TABLE]: [{ houses: houses.length }] }]),
      ),
      narrative: narrativeBindings({
        houseCount: night.houses.length,
        lights: night.porchLights.lights,
        events,
        arrivals: schedule.arrivals,
        welcoming,
      }),
    };
  },
};
