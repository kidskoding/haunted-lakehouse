import "server-only";
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

/** Whether batch `index` is among the first `visibleBatchCount` the player can preview. */
export function isBatchVisible(index: number, visibleBatchCount: number): boolean {
  return Number.isInteger(index) && index >= 0 && index < visibleBatchCount;
}

/**
 * The batches a preview may load: the first `visibleBatchCount`. Hidden batches stay out of
 * bronze until the player runs the night (or peeks with The Raven's Feather).
 */
export function visibleBatches(data: PuzzleData, visibleBatchCount: number): readonly Batch[] {
  assertVisibleBatchCount(data, visibleBatchCount);
  return data.batches.slice(0, visibleBatchCount);
}
