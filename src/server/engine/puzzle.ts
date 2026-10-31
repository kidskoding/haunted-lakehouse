import "server-only";
import type { Rng } from "./random";
import type { Slot } from "./slots";

/** A single cell. Timestamps travel as ISO 8601 strings so every engine reads them the same. */
export type Cell = string | number | boolean | null;

export type Row = Readonly<Record<string, Cell>>;

/** One delivery of raw data: the rows that land in each bronze feed at the same moment. */
export interface Batch {
  /** Position in arrival order, from 0. */
  readonly index: number;
  /** Local wall-clock time the batch lands, as the story shows it. */
  readonly arrivesAt: string;
  readonly feeds: Readonly<Record<string, readonly Row[]>>;
}

/** A moment when someone in town looks at a gold table. */
export interface Checkpoint {
  readonly id: string;
  /** The checkpoint sees every batch up to and including this index. */
  readonly afterBatch: number;
  readonly label: string;
}

/** Everything one seed produces for one puzzle. */
export interface PuzzleData {
  readonly batches: readonly Batch[];
  readonly checkpoints: readonly Checkpoint[];
  /** The correct gold tables at each checkpoint, keyed by checkpoint id, then table name. */
  readonly expected: Readonly<Record<string, Readonly<Record<string, readonly Row[]>>>>;
  /** Values the story text renders, so every number the player reads comes from their data. */
  readonly narrative: Readonly<Record<string, string | number>>;
}

export interface GenerateContext {
  readonly runSeed: string;
  /**
   * A stream keyed by this puzzle, run seed, and slot, plus the labels. Each independent part
   * of the generator takes its own label, so changing one part never reshuffles another.
   */
  readonly rng: (...labels: (string | number)[]) => Rng;
}

/**
 * A bronze column the Curse of Possession may twist mid-night. Declare only columns whose
 * new shape leaves the right answer unchanged: never a key, and never a column the puzzle
 * already drifts on purpose. A column offers each rename and, with a unit, a stringify.
 */
export interface PossessableColumn {
  readonly feed: string;
  readonly column: string;
  /** Names the vendor might switch the column to. Each must be new to the feed. */
  readonly aliases?: readonly string[];
  /** A unit the vendor might start writing into the value as text: 412 becomes "412 g". */
  readonly unit?: string;
}

export interface Puzzle {
  /** Stable forever: it keys every seed's data. */
  readonly id: string;
  readonly slot: Slot;
  readonly title: string;
  /** Puzzles that must have been played earlier in the same run, whose tables this one builds on. */
  readonly prerequisites: readonly string[];
  /** How many of the most recent batches bronze keeps. */
  readonly retention: number;
  /**
   * How many batches, from the first, the player may query before running the night. Later
   * batches stay hidden until a night attempt (or The Raven's Feather). Must leave at least
   * one batch hidden so the night can surprise them.
   */
  readonly visibleBatchCount: number;
  /** The batch the night runs twice to check that gold doesn't flinch (Act III). Absent: none. */
  readonly replayBatch?: number;
  /** The gold tables the player must build, which checkpoints compare. */
  readonly goldTables: readonly string[];
  /** Where the Curse of Possession may strike. Without any, the curse passes this hour by. */
  readonly possessable?: readonly PossessableColumn[];
  /**
   * Narrative keys holding the symptom numbers, which the Curse of the Fog withholds.
   * Without a declaration, the fog takes every numeric binding.
   */
  readonly symptoms?: readonly string[];
  generate(context: GenerateContext): PuzzleData;
}

/**
 * Checks that generated data is internally consistent. Every puzzle's tests run this across
 * many seeds, so a generator bug surfaces as a precise message rather than a confusing night.
 */
export function validatePuzzleData(puzzle: Puzzle, data: PuzzleData): string[] {
  const problems: string[] = [];
  const { batches, checkpoints, expected } = data;

  if (batches.length === 0) problems.push("There are no batches.");
  batches.forEach((batch, i) => {
    if (batch.index !== i)
      problems.push(`Batch at position ${String(i)} has index ${String(batch.index)}.`);
  });

  const { visibleBatchCount } = puzzle;
  if (
    !Number.isInteger(visibleBatchCount) ||
    visibleBatchCount < 1 ||
    visibleBatchCount >= batches.length
  ) {
    problems.push(
      `Between 1 and ${String(batches.length - 1)} batches must be visible before the night, not ${String(visibleBatchCount)}.`,
    );
  }

  const { replayBatch } = puzzle;
  if (replayBatch !== undefined && !batches.some((batch) => batch.index === replayBatch)) {
    problems.push(`The replay batch ${String(replayBatch)} does not exist.`);
  }

  // Pipeline model ids are lowercase, so hashes for a mixed-case name could never match.
  for (const table of puzzle.goldTables) {
    if (table !== table.toLowerCase()) {
      problems.push(
        `Gold table ${table} must be lowercase, as the pipeline names it ${table.toLowerCase()}.`,
      );
    }
  }

  if (checkpoints.length === 0) problems.push("There are no checkpoints.");
  const seen = new Set<string>();
  let previous = -1;
  for (const checkpoint of checkpoints) {
    if (seen.has(checkpoint.id)) problems.push(`Checkpoint ${checkpoint.id} appears twice.`);
    seen.add(checkpoint.id);
    const { afterBatch } = checkpoint;
    if (!Number.isInteger(afterBatch) || afterBatch < 0 || afterBatch >= batches.length) {
      problems.push(`Checkpoint ${checkpoint.id} follows a batch that does not exist.`);
    }
    if (afterBatch < previous) {
      problems.push(`Checkpoint ${checkpoint.id} comes before the checkpoint listed ahead of it.`);
    }
    previous = afterBatch;

    const tables = expected[checkpoint.id];
    if (!tables) {
      problems.push(`Checkpoint ${checkpoint.id} has no expected state.`);
      continue;
    }
    for (const table of puzzle.goldTables) {
      if (!(table in tables))
        problems.push(`Checkpoint ${checkpoint.id} has no expected ${table}.`);
    }
    for (const table of Object.keys(tables)) {
      if (!puzzle.goldTables.includes(table)) {
        problems.push(`Checkpoint ${checkpoint.id} expects ${table}, which is not a gold table.`);
      }
    }
  }
  for (const id of Object.keys(expected)) {
    if (!seen.has(id)) problems.push(`Expected state for ${id} matches no checkpoint.`);
  }
  return problems;
}
