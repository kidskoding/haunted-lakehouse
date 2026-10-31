import "server-only";
import type { Puzzle } from "../puzzle";
import { rngFor } from "../random";
import type { PuzzleRegistry } from "../registry";
import { drawCurse } from "./curses";
import { drawOffer } from "./relics";
import { RUN_STREAM } from "./streams";
import type { RunEvent, RunState } from "./types";

/** Puzzles this run has cleared. A skipped hour built no tables, so it doesn't count. */
export function playedPuzzles(state: RunState): Set<string> {
  return new Set(state.history.filter((h) => h.outcome === "cleared").map((h) => h.puzzleId));
}

/** The puzzles in the current slot's pool whose prerequisites this run has already played. */
export function eligiblePuzzles(registry: PuzzleRegistry, state: RunState): readonly Puzzle[] {
  const played = playedPuzzles(state);
  return registry
    .pool(state.slot)
    .filter((puzzle) => puzzle.prerequisites.every((id) => played.has(id)));
}

/**
 * The event the game itself owes a playing run, if it is waiting on one: the next hour's
 * draw, or the relic offer after a clear. Draws are keyed by seed and slot, never by event
 * position, so failed attempts and relic choices can't reroll them. The drawn values travel
 * in the event, so stored runs replay unchanged after new puzzles join a pool.
 */
export function nextGameEvent(registry: PuzzleRegistry, state: RunState): RunEvent | null {
  if (state.status !== "playing") return null;
  switch (state.phase) {
    case "opening": {
      const eligible = eligiblePuzzles(registry, state);
      if (eligible.length === 0) return { kind: "pool_exhausted", slot: state.slot };
      const puzzle = rngFor([RUN_STREAM, state.seed, state.slot, "puzzle"]).pick(eligible);
      return {
        kind: "hour_opened",
        slot: state.slot,
        puzzleId: puzzle.id,
        curse: drawCurse(state.seed, state.slot),
      };
    }
    case "offering":
      return { kind: "relic_offered", relics: drawOffer(state) };
    case "in-hour":
    case "choosing":
    case "ended":
      return null;
  }
}
