import "server-only";
import type { Row } from "../../puzzle";
import { ITEMS, type Drop } from "./drops";
import { isCountable, type Spelling } from "./spellings";

/**
 * The Mayor's tally over the drops that have arrived: for each item delivered so far, the
 * pieces that can be counted and the drops he disputes. A readable spelling always names the
 * true quantity, so the countable pieces are the true ones.
 */
export function decorationTally(
  drops: readonly Drop[],
  spellings: ReadonlyMap<string, Spelling>,
): Row[] {
  const totals = new Map<string, { pieces: number; disputed: number }>();
  for (const drop of drops) {
    const total = totals.get(drop.item) ?? { pieces: 0, disputed: 0 };
    if (isCountable(spellings.get(drop.dropId))) total.pieces += drop.quantity;
    else total.disputed += 1;
    totals.set(drop.item, total);
  }
  return ITEMS.flatMap((item) => {
    const total = totals.get(item);
    return total ? [{ item, ...total }] : [];
  });
}
