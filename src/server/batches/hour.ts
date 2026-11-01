import "server-only";
import { generateHour } from "../engine/curses/apply";
import type { Puzzle, PuzzleData } from "../engine/puzzle";
import type { OpenHour, RunState } from "../engine/run/types";
import { puzzleRegistry } from "../runs/load";

export interface OpenHourData {
  readonly hour: OpenHour;
  readonly puzzle: Puzzle;
  /** The night as the player plays it, with the hour's curse already worked in. */
  readonly data: PuzzleData;
  /** How many batches bronze keeps this hour, after the Curse of Short Memory. */
  readonly retention: number;
}

/**
 * The open hour's puzzle and its cursed night for this run's seed. Null when the run is not
 * currently in an hour (opening, offering, choosing, or ended).
 */
export function openHourData(state: RunState): OpenHourData | null {
  if (state.phase !== "in-hour" || !state.hour) return null;
  const puzzle = puzzleRegistry.get(state.hour.puzzleId);
  if (!puzzle) {
    throw new Error(`Open hour names unknown puzzle ${state.hour.puzzleId}.`);
  }
  const { data, retention } = generateHour(puzzle, state.seed, state.hour.curse);
  return { hour: state.hour, puzzle, data, retention };
}
