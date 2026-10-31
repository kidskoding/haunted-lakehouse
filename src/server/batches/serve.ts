import "server-only";
import { visibleIndices } from "../engine/batches/visibility";
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
 * The batches a preview may load for this puzzle: the visible ones plus every batch a failed
 * night has `revealed`. Never includes expected gold state.
 */
export function previewBatches(
  puzzle: Puzzle,
  data: PuzzleData,
  revealed: readonly number[],
): readonly Batch[] {
  const visible = new Set(visibleIndices(data, puzzle.visibleBatchCount, revealed));
  return data.batches.filter((batch) => visible.has(batch.index)).map(publicBatch);
}

/**
 * Serves one batch. Visible and `revealed` batches are always allowed; any other requires an
 * active run-the-night attempt for this hour. Expected gold state is never included.
 */
export function serveBatch(
  puzzle: Puzzle,
  data: PuzzleData,
  revealed: readonly number[],
  index: number,
  nightAttempt: boolean,
): ServeBatchResult {
  const visible = visibleIndices(data, puzzle.visibleBatchCount, revealed);
  const found = Number.isInteger(index) ? data.batches[index] : undefined;
  if (!found) return { ok: false, reason: "unknown-batch" };
  if (!nightAttempt && !visible.includes(index)) {
    return { ok: false, reason: "hidden" };
  }
  return { ok: true, batch: publicBatch(found) };
}
