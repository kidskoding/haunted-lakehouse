import "server-only";
import type { Rng } from "../random";

/**
 * Unique hardware-style ids such as `PL-3F0A`, one per key, in key order. Random rather than
 * sequential so a device id never gives away which house it sits on.
 */
export function deviceIds(rng: Rng, prefix: string, keys: readonly string[]): Map<string, string> {
  if (keys.length > 0x10000) throw new RangeError("Too many devices for four hex digits.");
  const taken = new Set<string>();
  const ids = new Map<string, string>();
  for (const key of keys) {
    let id: string;
    do {
      id = `${prefix}-${rng.int(0, 0x10000).toString(16).toUpperCase().padStart(4, "0")}`;
    } while (taken.has(id));
    taken.add(id);
    ids.set(key, id);
  }
  return ids;
}

/** Plain code-unit string order, independent of locale. */
export function byText(a: string, b: string): number {
  if (a === b) return 0;
  return a < b ? -1 : 1;
}
