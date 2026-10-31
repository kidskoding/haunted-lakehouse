/**
 * The arithmetic behind the virtualized grid: which rows and columns to render for a scroll
 * position, and how a body taller than the browser can lay out maps onto one it can.
 */

/**
 * The tallest body the grid lays out. Browsers cap element sizes (Firefox near 17.9M px,
 * Chrome near 33.5M px), so a taller result is scrolled through a scaled-down body.
 */
export const MAX_BODY_PX = 15_000_000;

/** The body's laid-out height and the factor from physical to virtual scroll offsets. */
export interface BodyScale {
  /** The virtual height: every row at its full pitch. */
  readonly virtualHeight: number;
  /** The height the browser lays out. */
  readonly physicalHeight: number;
  /** Virtual scroll pixels per physical scroll pixel; 1 when nothing is scaled. */
  readonly ratio: number;
}

export function bodyScale(rowCount: number, rowHeight: number, viewport: number): BodyScale {
  const virtualHeight = rowCount * rowHeight;
  const physicalHeight = Math.min(virtualHeight, MAX_BODY_PX);
  const virtualRange = virtualHeight - viewport;
  const physicalRange = physicalHeight - viewport;
  const ratio = virtualRange > 0 && physicalRange > 0 ? virtualRange / physicalRange : 1;
  return { virtualHeight, physicalHeight, ratio };
}

/** A half-open span `[start, end)` of indexes to render. */
export interface Span {
  readonly start: number;
  readonly end: number;
}

/** The rows that meet a viewport at virtual offset `offset`, widened by `overscan` each side. */
export function rowWindow(
  offset: number,
  viewport: number,
  rowHeight: number,
  rowCount: number,
  overscan: number,
): Span {
  if (rowCount === 0 || viewport <= 0) return { start: 0, end: 0 };
  const first = Math.floor(Math.max(0, offset) / rowHeight);
  const last = Math.ceil((Math.max(0, offset) + viewport) / rowHeight);
  return {
    start: Math.max(0, Math.min(rowCount - 1, first) - overscan),
    end: Math.min(rowCount, last + overscan),
  };
}

/** Each column's left edge, plus a final entry for the total width. */
export function columnOffsets(widths: readonly number[]): number[] {
  const offsets = [0];
  let total = 0;
  for (const width of widths) {
    total += width;
    offsets.push(total);
  }
  return offsets;
}

/** The index of the column whose span holds `x`, by binary search over `offsets`. */
function columnAt(offsets: readonly number[], x: number): number {
  let low = 0;
  let high = offsets.length - 2;
  while (low < high) {
    const mid = (low + high + 1) >> 1;
    if ((offsets[mid] ?? 0) <= x) low = mid;
    else high = mid - 1;
  }
  return low;
}

/** The columns that meet `[offset, offset + viewport)`, widened by `overscan` each side. */
export function columnWindow(
  offsets: readonly number[],
  offset: number,
  viewport: number,
  overscan: number,
): Span {
  const count = offsets.length - 1;
  if (count <= 0 || viewport <= 0) return { start: 0, end: 0 };
  const first = columnAt(offsets, Math.max(0, offset));
  const last = columnAt(offsets, Math.max(0, offset + viewport - 1));
  return { start: Math.max(0, first - overscan), end: Math.min(count, last + 1 + overscan) };
}

/**
 * The scroll offset that brings `[start, end)` fully into a viewport of `size` at `current`,
 * moving as little as possible; the start wins when the span is larger than the viewport.
 */
export function reveal(current: number, size: number, start: number, end: number): number {
  if (start < current) return start;
  if (end > current + size) return Math.min(start, end - size);
  return current;
}
