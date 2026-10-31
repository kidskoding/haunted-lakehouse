import "server-only";
import type { GenerateContext, Puzzle, PuzzleData } from "./puzzle";
import { rngFor } from "./random";
import { SLOTS, type Slot } from "./slots";

export interface PuzzleRegistry {
  /** The puzzles a run can draw for a slot, ordered by id so draws never depend on registration order. */
  pool(slot: Slot): readonly Puzzle[];
  get(id: string): Puzzle | undefined;
}

/**
 * Builds the slot pools, rejecting puzzles a run could not play: duplicate ids, retention
 * below one batch, and prerequisites that are unknown or not in an earlier slot. A slot may
 * have an empty pool while its puzzles are still being written.
 */
export function createPuzzleRegistry(puzzles: readonly Puzzle[]): PuzzleRegistry {
  const byId = new Map<string, Puzzle>();
  for (const puzzle of puzzles) {
    if (byId.has(puzzle.id)) throw new Error(`Two puzzles share the id ${puzzle.id}.`);
    if (!Number.isInteger(puzzle.retention) || puzzle.retention < 1) {
      throw new Error(`Puzzle ${puzzle.id} must retain at least one batch.`);
    }
    if (!Number.isInteger(puzzle.visibleBatchCount) || puzzle.visibleBatchCount < 1) {
      throw new Error(`Puzzle ${puzzle.id} must show at least one batch before the night.`);
    }
    byId.set(puzzle.id, puzzle);
  }

  for (const puzzle of puzzles) {
    for (const prerequisite of puzzle.prerequisites) {
      const required = byId.get(prerequisite);
      if (!required) {
        throw new Error(`Puzzle ${puzzle.id} needs ${prerequisite}, which is not registered.`);
      }
      if (required.slot >= puzzle.slot) {
        throw new Error(
          `Puzzle ${puzzle.id} needs ${prerequisite}, which is not in an earlier slot.`,
        );
      }
    }
  }

  const pools = new Map<Slot, Puzzle[]>();
  for (const { slot } of SLOTS) {
    // Ids are unique, so the comparison never ties.
    pools.set(
      slot,
      puzzles.filter((p) => p.slot === slot).sort((a, b) => (a.id < b.id ? -1 : 1)),
    );
  }

  return {
    pool: (slot) => pools.get(slot) ?? [],
    get: (id) => byId.get(id),
  };
}

/** The context a puzzle generates in for a run, with every stream keyed by (puzzle id, run seed, slot). */
export function generateContext(puzzle: Puzzle, runSeed: string): GenerateContext {
  return {
    runSeed,
    rng: (...labels) => rngFor([puzzle.id, runSeed, puzzle.slot, ...labels]),
  };
}

/** Generates a puzzle's data for a run, with every stream keyed by (puzzle id, run seed, slot). */
export function generatePuzzle(puzzle: Puzzle, runSeed: string): PuzzleData {
  return puzzle.generate(generateContext(puzzle, runSeed));
}
