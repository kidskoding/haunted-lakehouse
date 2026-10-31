import "server-only";
import { rngFor } from "../random";
import { slotDefinition } from "../slots";
import { CHARACTERS } from "./characters";
import { RUN_STREAM } from "./streams";
import type { CurseId, RelicId, RunState } from "./types";

export const RELICS: readonly RelicId[] = [
  "wrens-lantern",
  "ravens-feather",
  "hourglass",
  "black-cat",
  "spare-candle",
];

/**
 * Relics a player could be offered: anything not already in hand. Spare Candle burns the
 * moment it's chosen, so it can always come round again.
 */
export function offerableRelics(held: readonly RelicId[]): RelicId[] {
  return RELICS.filter((relic) => relic === "spare-candle" || !held.includes(relic));
}

/**
 * How many relics the offer after the hour just cleared must hold. A cursed hour pays one
 * extra relic for the trouble, so a curse is a gamble rather than pure punishment.
 */
export function offerSize(state: RunState): number {
  const base = CHARACTERS[state.character].offerSize;
  if (base === 0) return 0;
  const cleared = state.history.at(-1);
  const bonus = cleared?.outcome === "cleared" && cleared.curse !== null ? 1 : 0;
  return Math.min(base + bonus, offerableRelics(state.relics).length);
}

/**
 * Whether clearing the open hour would put one more relic on the table for its curse. Never
 * for a clear hour, a character who is never offered relics, a boss clear that ends the run,
 * or when every relic not in hand is already on offer.
 */
export function curseAddsRelic(state: RunState): boolean {
  const hour = state.hour;
  if (!hour || hour.curse === null) return false;
  const { act, boss } = slotDefinition(hour.slot);
  if (boss && act >= state.unlockedActs) return false;
  const offerAfter = (curse: CurseId | null) =>
    offerSize({ ...state, history: [...state.history, { ...hour, curse, outcome: "cleared" }] });
  return offerAfter(hour.curse) > offerAfter(null);
}

/**
 * Draws the offer for the hour just cleared: distinct relics, by a partial shuffle of the
 * offerable ones in their fixed order, keyed by seed and the cleared slot.
 */
export function drawOffer(state: RunState): RelicId[] {
  const cleared = state.history.at(-1);
  if (!cleared) throw new Error("An offer follows a cleared hour.");
  const candidates = offerableRelics(state.relics);
  const rng = rngFor([RUN_STREAM, state.seed, cleared.slot, "relics"]);
  const size = offerSize(state);
  for (let i = 0; i < size; i++) {
    const j = rng.int(i, candidates.length);
    [candidates[i], candidates[j]] = [candidates[j] as RelicId, candidates[i] as RelicId];
  }
  return candidates.slice(0, size);
}
