import "server-only";
import { revealBatch } from "../../../lib/executor/reveal";
import type { Batch, PuzzleData } from "../puzzle";

/**
 * Checks that `visibleBatchCount` is a whole number of batches the player may already query,
 * from zero up to the full night. Used by preview serving and by The Raven's Feather.
 */
export function assertVisibleBatchCount(data: PuzzleData, visibleBatchCount: number): void {
  const { length } = data.batches;
  if (!Number.isInteger(visibleBatchCount) || visibleBatchCount < 0 || visibleBatchCount > length) {
    throw new RangeError(
      `Between 0 and ${String(length)} batches can be visible, not ${String(visibleBatchCount)}.`,
    );
  }
}

/**
 * The batches a preview may load: the first `visibleBatchCount`. Hidden batches stay out of
 * bronze until the player runs the night (or peeks with The Raven's Feather).
 */
export function visibleBatches(data: PuzzleData, visibleBatchCount: number): readonly Batch[] {
  assertVisibleBatchCount(data, visibleBatchCount);
  return data.batches.slice(0, visibleBatchCount);
}

/**
 * The batch indices the player can query now: the first `visibleBatchCount`, plus the batch
 * each failed night revealed. Folding through `revealBatch` keeps this equal to the client's.
 */
export function visibleIndices(
  data: PuzzleData,
  visibleBatchCount: number,
  revealed: readonly number[],
): readonly number[] {
  return revealed.reduce<readonly number[]>(
    (visible, revealedBatch) => revealBatch(data.batches, visible, { revealedBatch }),
    visibleBatches(data, visibleBatchCount).map((batch) => batch.index),
  );
}
