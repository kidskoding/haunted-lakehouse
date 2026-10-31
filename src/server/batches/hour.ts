import "server-only";
import type { Puzzle, PuzzleData } from "../engine/puzzle";
import { generatePuzzle } from "../engine/registry";
import type { OpenHour, RunState } from "../engine/run/types";
import { puzzleRegistry } from "../runs/load";

export interface OpenHourData {
  readonly hour: OpenHour;
  readonly puzzle: Puzzle;
  readonly data: PuzzleData;
}

/**
 * The open hour's puzzle and its generated data for this run's seed. Null when the run is
 * not currently in an hour (opening, offering, choosing, or ended).
 */
export function openHourData(state: RunState): OpenHourData | null {
  if (state.phase !== "in-hour" || !state.hour) return null;
  const puzzle = puzzleRegistry.get(state.hour.puzzleId);
  if (!puzzle) {
    throw new Error(`Open hour names unknown puzzle ${state.hour.puzzleId}.`);
  }
  return { hour: state.hour, puzzle, data: generatePuzzle(puzzle, state.seed) };
}
