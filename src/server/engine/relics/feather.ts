import "server-only";
import { assertVisibleBatchCount, visibleIndices } from "../batches/visibility";
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
 * `visibleBatchCount` batches and every batch a failed night `revealed`, as the batch routes
 * serve them. Peeking at one they can already query would waste the relic.
 */
export function expectHidden(
  data: PuzzleData,
  batch: number,
  visibleBatchCount: number,
  revealed: readonly number[],
): void {
  assertVisibleBatchCount(data, visibleBatchCount);
  peekBatch(data, batch);
  if (visibleIndices(data, visibleBatchCount, revealed).includes(batch)) {
    throw new RelicError("batch-not-hidden", `Batch ${String(batch)} is already in bronze.`);
  }
}
