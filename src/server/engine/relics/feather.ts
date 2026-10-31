import "server-only";
import type { Batch, PuzzleData } from "../puzzle";
import { RelicError } from "./errors";

/**
 * The batch The Raven's Feather shows. Only the raw rows are revealed; the expected state
 * of any checkpoint after it stays hidden.
 */
export function peekBatch(data: PuzzleData, batch: number): Batch {
  const found = Number.isInteger(batch) ? data.batches[batch] : undefined;
  if (!found) {
    throw new RelicError("unknown-batch", `Tonight has no batch ${String(batch)}.`);
  }
  return { index: found.index, arrivesAt: found.arrivesAt, feeds: found.feeds };
}

/**
 * Checks that a batch is still hidden from the player, who already sees the first
 * `visibleBatchCount` batches. Peeking at one they can already query would waste the relic.
 */
export function expectHidden(data: PuzzleData, batch: number, visibleBatchCount: number): void {
  const { length } = data.batches;
  if (!Number.isInteger(visibleBatchCount) || visibleBatchCount < 0 || visibleBatchCount > length) {
    throw new RangeError(
      `Between 0 and ${String(length)} batches can be visible, not ${String(visibleBatchCount)}.`,
    );
  }
  peekBatch(data, batch);
  if (batch < visibleBatchCount) {
    throw new RelicError("batch-not-hidden", `Batch ${String(batch)} is already in bronze.`);
  }
}
