import "server-only";
import { CANDY_CATALOG } from "../../world/candy";
import { CURSE_BELL } from "../../world/candy-bowls";
import type { House } from "../../world/houses";
import type { Night } from "../../world/night";
import type { CursedStreetRow } from "./cursed";

/** "Lantern Row", "Lantern Row and Wick Street", "A, B, and C". */
function listOf(items: readonly string[]): string {
  if (items.length <= 2) return items.join(" and ");
  return `${items.slice(0, -1).join(", ")}, and ${items.at(-1) ?? ""}`;
}

/**
 * Values the hour's story renders, keyed by their placeholders in the story bible. Bags count
 * every bag a household bought from the Co-op for the night, set out or held back for topping
 * up, so Marisol's number is true to the town though the player never sees a sale.
 */
export function narrativeBindings(
  night: Night,
  cursed: readonly string[],
  answer: readonly CursedStreetRow[],
): Record<string, string | number> {
  const { bowls } = night.candyBowls;
  const perBag = new Map(CANDY_CATALOG.map((c) => [c.candyType, c.piecesPerBag]));
  const bagsSold = bowls.reduce(
    (sum, b) => sum + b.initialPieces / (perBag.get(b.candyType) ?? 1) + b.refills.length,
    0,
  );
  const streets = answer.map((row) => row.street);
  // The family Marisol has to tell first: the lowest-numbered cursed house on the top street.
  // Houses come one side of the street at a time, so roster order is not house-number order.
  const first = night.houses
    .filter((h) => cursed.includes(h.houseId) && h.street === streets[0])
    .reduce<House | undefined>((low, h) => (low && low.number <= h.number ? low : h), undefined);
  return {
    bowl_count: bowls.length,
    bags_sold: bagsSold,
    scans_before_bell: night.doorScans.filter((s) => s.nightSecond < CURSE_BELL).length,
    cursed_count: cursed.length,
    cursed_street: listOf(streets),
    cursed_on_street: answer[0]?.cursed_houses ?? 0,
    cursed_household: first?.household ?? "",
  };
}
