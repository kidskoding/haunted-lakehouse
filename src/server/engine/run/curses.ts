import "server-only";
import { possessionOptions } from "../curses/possession";
import type { Puzzle } from "../puzzle";
import { rngFor } from "../random";
import type { Slot } from "../slots";
import { RUN_STREAM } from "./streams";
import type { CurseId } from "./types";

export const CURSES: readonly CurseId[] = ["possession", "fog", "short-memory", "darkness"];

/** One hour in four opens cursed, so a full night expects two or three. */
const CURSE_CHANCE = 0.25;

/**
 * The curses that can change `puzzle`'s hour. Possession needs a column to twist; without
 * one it would pass the hour by and still pay the cursed-hour relic.
 */
function cursesFor(puzzle: Puzzle): CurseId[] {
  const possessable = possessionOptions(puzzle).length > 0;
  return CURSES.filter((curse) => curse !== "possession" || possessable);
}

/**
 * The curse an hour opens with, if any. The first hour teaches the game and is never cursed.
 * Keyed by seed and slot alone, so retries and relic choices can never reroll it.
 */
export function drawCurse(seed: string, slot: Slot, puzzle: Puzzle): CurseId | null {
  if (slot === 1) return null;
  const rng = rngFor([RUN_STREAM, seed, slot, "curse"]);
  return rng.float() < CURSE_CHANCE ? rng.pick(cursesFor(puzzle)) : null;
}
