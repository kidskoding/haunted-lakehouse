import "server-only";
import type { Puzzle } from "../puzzle";
import type { CurseId, RunState } from "../run/types";

/** Under the Curse of Short Memory, bronze keeps only the batch that just landed. */
export const SHORT_MEMORY_RETENTION = 1;

/** How many of the most recent batches bronze keeps this hour. */
export function effectiveRetention(puzzle: Puzzle, curse: CurseId | null): number {
  return curse === "short-memory" ? SHORT_MEMORY_RETENTION : puzzle.retention;
}

/**
 * Whether the player may use a relic right now: only while working an hour, and never under
 * the Curse of Darkness. The reducer enforces this, and the UI reads it to dim the relic tray.
 */
export function relicsUsable(state: RunState): boolean {
  return state.phase === "in-hour" && state.hour !== null && state.hour.curse !== "darkness";
}
