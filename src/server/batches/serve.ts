import "server-only";
import {
  assertVisibleBatchCount,
  isBatchVisible,
  visibleBatches,
} from "../engine/batches/visibility";
import type { Batch, Puzzle, PuzzleData } from "../engine/puzzle";

export type ServeDenial = "unknown-batch" | "hidden";

export type ServeBatchResult =
  | { readonly ok: true; readonly batch: Batch }
  | { readonly ok: false; readonly reason: ServeDenial };

/**
 * Copies a batch so callers never receive a live reference into generated puzzle data (and
 * never the expected gold tables that sit beside it).
 */
function publicBatch(batch: Batch): Batch {
  return { index: batch.index, arrivesAt: batch.arrivesAt, feeds: batch.feeds };
}

/**
 * The batches a preview may load for this puzzle. Never includes expected gold state.
 */
export function previewBatches(puzzle: Puzzle, data: PuzzleData): readonly Batch[] {
  return visibleBatches(data, puzzle.visibleBatchCount).map(publicBatch);
}

/**
 * Serves one batch. Visible batches are always allowed; a hidden batch requires an active
 * run-the-night attempt for this hour. Expected gold state is never included.
 */
export function serveBatch(
  puzzle: Puzzle,
  data: PuzzleData,
  index: number,
  nightAttempt: boolean,
): ServeBatchResult {
  assertVisibleBatchCount(data, puzzle.visibleBatchCount);
  const found = Number.isInteger(index) ? data.batches[index] : undefined;
  if (!found) return { ok: false, reason: "unknown-batch" };
  if (!nightAttempt && !isBatchVisible(index, puzzle.visibleBatchCount)) {
    return { ok: false, reason: "hidden" };
  }
  return { ok: true, batch: publicBatch(found) };
}
