import "server-only";
import { rngFor, type Rng } from "../random";

/**
 * The town is shared by every puzzle in a run, so it is keyed by the run seed alone. Slot 0
 * is never a puzzle slot, so these streams can't collide with any puzzle's.
 */
export function townRng(runSeed: string, label: string): Rng {
  return rngFor(["hollow-creek", runSeed, 0, label]);
}

/** Picks from weighted options; weights need not sum to 1. */
export function weighted<T>(rng: Rng, options: readonly (readonly [T, number])[]): T {
  const total = options.reduce((sum, [, weight]) => sum + weight, 0);
  let roll = rng.float() * total;
  for (const [value, weight] of options) {
    roll -= weight;
    if (roll < 0) return value;
  }
  const last = options.at(-1);
  if (!last) throw new RangeError("weighted() needs at least one option.");
  return last[0];
}

// Fixed, so street names read the same in every run's story; which ones a run uses varies.
export const STREETS = [
  "Lantern Row",
  "Gallows Hill Road",
  "Mill Pond Lane",
  "Cobweb Court",
  "Old Orchard Way",
  "Raven's Bend",
  "Chapel Street",
  "Thistle Lane",
  "Hollow Creek Road",
  "Wick Street",
] as const;

export type Street = (typeof STREETS)[number];
