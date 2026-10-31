/**
 * Where a roving focus moves for a key press in a horizontal list (WAI-ARIA APG tabs and
 * toolbar patterns): arrows step and wrap, Home and End jump to the ends, and disabled items
 * are skipped. Returns `undefined` when the key is not a navigation key or when every item
 * is disabled; a lone enabled item returns itself.
 */
export function nextRovingIndex(
  current: number,
  disabled: readonly boolean[],
  key: string,
): number | undefined {
  const count = disabled.length;
  const enabled = (index: number) => disabled[index] === false;

  const walk = (start: number, step: 1 | -1): number | undefined => {
    for (let offset = 0; offset < count; offset += 1) {
      const index = (((start + step * offset) % count) + count) % count;
      if (enabled(index)) return index;
    }
    return undefined;
  };

  switch (key) {
    case "ArrowRight":
      return walk(current + 1, 1);
    case "ArrowLeft":
      return walk(current - 1, -1);
    case "Home":
      return walk(0, 1);
    case "End":
      return walk(count - 1, -1);
    default:
      return undefined;
  }
}
