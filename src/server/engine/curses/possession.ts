import "server-only";
import type { Batch, GenerateContext, Puzzle, PuzzleData, Row } from "../puzzle";

/** What the vendor does to the possessed column. */
export type PossessionChange =
  | { readonly kind: "rename"; readonly to: string }
  /** The value becomes text with a unit: 412 becomes "412 g". Nulls stay null. */
  | { readonly kind: "stringify"; readonly unit: string };

/** The drift one cursed hour suffers: one column of one feed, from one batch to the dawn. */
export interface Possession {
  readonly feed: string;
  readonly column: string;
  /** The first batch delivered in the new shape. */
  readonly fromBatch: number;
  readonly change: PossessionChange;
}

type Option = Omit<Possession, "fromBatch">;

/**
 * Every drift the puzzle allows, in declaration order so the seed's pick never depends on
 * anything but the puzzle. Throws for a declaration that offers no change, since a silent
 * no-op would let a curse pass unnoticed.
 */
export function possessionOptions(puzzle: Puzzle): Option[] {
  return (puzzle.possessable ?? []).flatMap(({ feed, column, aliases = [], unit }) => {
    if (aliases.length === 0 && unit === undefined) {
      throw new Error(`Puzzle ${puzzle.id} lets ${feed}.${column} be possessed into nothing.`);
    }
    const renames = aliases.map((to): Option => {
      if (to === column) {
        throw new Error(`Puzzle ${puzzle.id} renames ${feed}.${column} to itself.`);
      }
      return { feed, column, change: { kind: "rename", to } };
    });
    const stringify: Option[] =
      unit === undefined ? [] : [{ feed, column, change: { kind: "stringify", unit } }];
    return [...renames, ...stringify];
  });
}

/**
 * The batches a possession may start from: the middle third of the night, never the first
 * batch, so the player always meets the feed in its clean shape before it turns.
 */
function midNight(batchCount: number): { min: number; max: number } {
  const min = Math.max(1, Math.floor(batchCount / 3));
  const max = Math.min(batchCount - 1, Math.max(min, Math.ceil((2 * batchCount) / 3) - 1));
  return { min, max };
}

/**
 * Draws the hour's possession from the puzzle's own seeded streams, or null when the puzzle
 * declares nothing possessable or its night is too short to turn halfway through.
 */
export function drawPossession(
  puzzle: Puzzle,
  data: PuzzleData,
  context: GenerateContext,
): Possession | null {
  const options = possessionOptions(puzzle);
  if (options.length === 0 || data.batches.length < 2) return null;
  const rng = context.rng("curse", "possession");
  const option = rng.pick(options);
  const { min, max } = midNight(data.batches.length);
  return { ...option, fromBatch: rng.int(min, max + 1) };
}

function twist(row: Row, column: string, change: PossessionChange): Row {
  if (!(column in row)) return row;
  switch (change.kind) {
    case "rename":
      return Object.fromEntries(
        Object.entries(row).map(([name, value]) => [name === column ? change.to : name, value]),
      );
    case "stringify": {
      const value = row[column] ?? null;
      return value === null ? row : { ...row, [column]: `${String(value)} ${change.unit}` };
    }
  }
}

function checkFeed(data: PuzzleData, { feed, column, change }: Possession): void {
  const rows = data.batches.flatMap((batch) => batch.feeds[feed] ?? []);
  if (!data.batches.some((batch) => feed in batch.feeds)) {
    throw new Error(`Feed ${feed} never arrives, so it can't be possessed.`);
  }
  if (change.kind === "rename" && rows.some((row) => change.to in row)) {
    throw new Error(`Feed ${feed} already has a ${change.to}, so ${column} can't become it.`);
  }
}

/**
 * Delivers the possessed feed in its new shape from the possession's batch onward. Only the
 * delivered rows change: checkpoints, expected gold, and narrative come from the true night,
 * so the right answer is the same one the clean feed would have given.
 */
export function possess(data: PuzzleData, possession: Possession): PuzzleData {
  checkFeed(data, possession);
  const { feed, column, fromBatch, change } = possession;
  const batches = data.batches.map((batch): Batch => {
    const rows = batch.feeds[feed];
    if (batch.index < fromBatch || !rows) return batch;
    return {
      ...batch,
      feeds: { ...batch.feeds, [feed]: rows.map((row) => twist(row, column, change)) },
    };
  });
  return { ...data, batches };
}
