import "server-only";
import { CURSE_BELL, piecesRecordedBefore, type CandyBowlFeed } from "../../world/candy-bowls";
import { byText } from "../../world/device-ids";
import type { House } from "../../world/houses";

/** The number the Hollow answers to. */
export const CURSED_PIECES = 13;

/**
 * Pieces each candy-giving house gave out before the bell, by house id, as its bowl's scale
 * recorded them: the town counts what the scale had weighed by its last reading before 7pm.
 */
export function piecesBeforeBell(feed: CandyBowlFeed): Map<string, number> {
  const handoutsAt = Map.groupBy(feed.handouts, (h) => h.houseId);
  const readingsOf = Map.groupBy(feed.readings, (r) => r.deviceId);
  return new Map(
    feed.bowls.map((bowl) => [
      bowl.houseId,
      piecesRecordedBefore(
        handoutsAt.get(bowl.houseId) ?? [],
        readingsOf.get(bowl.deviceId) ?? [],
        CURSE_BELL,
      ),
    ]),
  );
}

/** Houses that gave out exactly 13 pieces before the bell, in id order. */
export function cursedHouses(feed: CandyBowlFeed): string[] {
  return [...piecesBeforeBell(feed)]
    .filter(([, pieces]) => pieces === CURSED_PIECES)
    .map(([houseId]) => houseId)
    .sort(byText);
}

/** A `gold.cursed_street` row. A type alias, not an interface, so it is a `Row` as it stands. */
export type CursedStreetRow = { readonly street: string; readonly cursed_houses: number };

/**
 * The `gold.cursed_street` rows: every street tied for the most cursed houses, with that
 * count, in street order. No rows when no house is cursed, since then no street is the most.
 */
export function mostCursedStreets(
  houses: readonly House[],
  cursed: readonly string[],
): CursedStreetRow[] {
  const streetOf = new Map(houses.map((h) => [h.houseId, h.street]));
  const counts = new Map<string, number>();
  for (const houseId of cursed) {
    const street = streetOf.get(houseId);
    if (street === undefined) throw new RangeError(`Cursed house ${houseId} is on no street.`);
    counts.set(street, (counts.get(street) ?? 0) + 1);
  }
  const most = Math.max(0, ...counts.values());
  return [...counts]
    .filter(([, count]) => count === most)
    .sort(([a], [b]) => byText(a, b))
    .map(([street, count]) => ({ street, cursed_houses: count }));
}
