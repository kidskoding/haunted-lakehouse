/**
 * The batches visible to the player after a break: the visible ones plus the batch the break
 * revealed, sorted by index. Only that batch is revealed; hidden batches before it stay
 * hidden. The server and the client both call this, so they agree on what the player sees.
 * Throws a `RangeError` when an index is not one of the hour's batches.
 */
export function revealBatch(
  batches: readonly { readonly index: number }[],
  visible: readonly number[],
  failure: { readonly revealedBatch: number },
): readonly number[] {
  const indices = new Set(batches.map((batch) => batch.index));
  for (const index of [...visible, failure.revealedBatch]) {
    if (!indices.has(index)) {
      throw new RangeError(`Batch ${String(index)} is not one of the hour's batches.`);
    }
  }
  return [...new Set([...visible, failure.revealedBatch])].sort((a, b) => a - b);
}
