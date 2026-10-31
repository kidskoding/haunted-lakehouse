import "server-only";
import type { GenerateContext, Puzzle, PuzzleData } from "../puzzle";
import { generateContext } from "../registry";
import type { CurseId } from "../run/types";
import { fogNarrative } from "./fog";
import { effectiveRetention } from "./limits";
import { drawPossession, possess, type Possession } from "./possession";

/** One hour as the player will play it, with its curse already worked into the night. */
export interface HourSetup {
  readonly curse: CurseId | null;
  readonly data: PuzzleData;
  readonly retention: number;
  /** Narrative keys the Fog took, which the story renders as fog. Empty when clear. */
  readonly withheld: readonly string[];
  /** The drift Possession brought, for the autopsy and Wren's Lantern. Null when none. */
  readonly possession: Possession | null;
}

/**
 * Works a curse into a puzzle's generated night. Darkness changes nothing here: it lives in
 * the run's rules, where the reducer refuses relics. A curse never touches checkpoints or
 * expected gold, so a cursed hour is harder to play but has the same right answer.
 */
export function applyCurse(
  curse: CurseId | null,
  puzzle: Puzzle,
  data: PuzzleData,
  context: GenerateContext,
): HourSetup {
  const clear: HourSetup = {
    curse,
    data,
    retention: effectiveRetention(puzzle, curse),
    withheld: [],
    possession: null,
  };
  switch (curse) {
    case null:
    case "short-memory":
    case "darkness":
      return clear;
    case "fog": {
      const { narrative, withheld } = fogNarrative(puzzle, data.narrative);
      return { ...clear, data: { ...data, narrative }, withheld };
    }
    case "possession": {
      const possession = drawPossession(puzzle, data, context);
      if (!possession) return clear;
      return { ...clear, data: possess(data, possession), possession };
    }
  }
}

/** Generates a puzzle's night for a run and applies the hour's curse: the one call the server makes. */
export function generateHour(puzzle: Puzzle, runSeed: string, curse: CurseId | null): HourSetup {
  const context = generateContext(puzzle, runSeed);
  return applyCurse(curse, puzzle, puzzle.generate(context), context);
}
