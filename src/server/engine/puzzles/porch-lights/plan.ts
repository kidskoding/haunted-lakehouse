import "server-only";
import { batchLandingBy, type Cadence } from "../../batches/cadence";
import type { SchedulePlan } from "../../batches/schedule";
import type { Checkpoint } from "../../puzzle";
import { clockAt } from "../../world/night-clock";
import { porchLightRows, type PorchLightEvent } from "../../world/porch-lights";

export const FEED = "porch_lights";

const MINUTE = 60;

/** The hour runs from 18:00 to 18:45; its last batch lands as the next hour opens. */
export const HOUR_END = 45 * MINUTE;

export const CADENCE: Cadence = { every: 5 * MINUTE, from: 5 * MINUTE, until: HOUR_END };

/** Every batch of the hour. Bronze keeps them all: the tutorial is generous on purpose. */
export const BATCH_COUNT = HOUR_END / (5 * MINUTE);

/** When the Mayor looks at his dashboard, as night seconds. */
const CHECKPOINTS = [
  { id: "quarter-past", second: 15 * MINUTE },
  { id: "half-past", second: 30 * MINUTE },
  { id: "quarter-to", second: HOUR_END },
] as const;

export type CheckpointId = (typeof CHECKPOINTS)[number]["id"];

/** Each checkpoint reads gold right after the batch landing at its second. */
export function checkpoints(landings: readonly number[]): (Checkpoint & { id: CheckpointId })[] {
  return CHECKPOINTS.map(({ id, second }) => {
    const afterBatch = batchLandingBy(landings, second);
    if (afterBatch === undefined || landings[afterBatch] !== second) {
      throw new RangeError(`No batch lands at the ${id} checkpoint.`);
    }
    return { id, afterBatch, label: clockAt(second).local.slice(11, 16) };
  });
}

/** The changes that happen within the hour; later ones belong to later hours. */
export function hourEvents(events: readonly PorchLightEvent[]): PorchLightEvent[] {
  return events.filter((e) => e.nightSecond <= HOUR_END);
}

/**
 * How the hour's reports arrive: a few are shuffled within their batch and a few are held up
 * one delivery. No duplicates and no drift; this is the tutorial.
 */
export function deliveryPlan(events: readonly PorchLightEvent[]): SchedulePlan {
  const rows = porchLightRows(events);
  return {
    cadence: CADENCE,
    feeds: {
      [FEED]: {
        events: events.map((event, i) => {
          const row = rows[i];
          if (!row) throw new Error(`Porch light event ${String(i)} has no row.`);
          return { at: event.nightSecond, row };
        }),
        injections: [
          { kind: "outOfOrder", share: 0.3 },
          { kind: "late", share: 0.05, by: { batches: { min: 1, max: 1 } } },
        ],
      },
    },
  };
}
