import "server-only";
import type { Row } from "../../puzzle";
import type { Rng } from "../../random";
import { byText } from "../../world/device-ids";
import type { Night } from "../../world/night";
import { clockAt } from "../../world/night-clock";

/** What Hobb's van carries. Candles are for jack-o'-lanterns, so only pumpkin porches get them. */
export const ITEMS = [
  "candle",
  "fog juice",
  "cobweb",
  "lantern",
  "skeleton",
  "glow stick",
] as const;

export type Item = (typeof ITEMS)[number];

/** One drop-off as it truly happened. */
export interface Drop {
  readonly dropId: string;
  readonly houseId: string;
  readonly item: Item;
  readonly quantity: number;
  /** True time, in seconds since 18:00. */
  readonly second: number;
}

/** The van works from 19:30, as the hour opens, until the invoice goes out at 20:15. */
export const VAN_FROM = 90 * 60;
export const VAN_UNTIL = 135 * 60;
// The van starts at the depot end of town, so its first drop always lands in the first upload.
const FIRST_DROP_BY = VAN_FROM + 5 * 60;

const CANDLES = [2, 3, 4, 6, 6, 8, 10, 12, 12] as const;
const OTHER_ITEMS = ["fog juice", "cobweb", "lantern", "skeleton", "glow stick"] as const;

function quantityOf(rng: Rng, item: (typeof OTHER_ITEMS)[number]): number {
  switch (item) {
    case "fog juice":
      return rng.int(1, 5);
    case "cobweb":
      return rng.int(1, 7);
    case "lantern":
      return rng.int(2, 9);
    case "skeleton":
      return rng.int(1, 3);
    case "glow stick":
      // Glow sticks only come in dozen packs.
      return rng.pick([12, 24]);
  }
}

/**
 * Every drop of the evening, in time order: a box of candles for each house with a
 * jack-o'-lantern sensor, and one to three other drops for each candy-giving house. Each
 * house draws from its own stream, so one house never reshuffles another.
 */
export function generateDrops(night: Night, rng: (...labels: string[]) => Rng): Drop[] {
  const pumpkins = new Set(night.pumpkinSensors.sensors.map((s) => s.houseId));
  const unsorted: Omit<Drop, "dropId">[] = [];
  for (const house of night.houses) {
    const draw = rng("drops", house.houseId);
    const at = () => draw.int(VAN_FROM, VAN_UNTIL + 1);
    const { houseId } = house;
    if (pumpkins.has(houseId)) {
      unsorted.push({ houseId, item: "candle", quantity: draw.pick(CANDLES), second: at() });
    }
    if (!house.givesCandy) continue;
    const count = draw.int(1, 4);
    for (let i = 0; i < count; i++) {
      const item = draw.pick(OTHER_ITEMS);
      unsorted.push({ houseId, item, quantity: quantityOf(draw, item), second: at() });
    }
  }

  const sorted = unsorted.sort(
    (a, b) =>
      a.second - b.second ||
      byText(a.houseId, b.houseId) ||
      ITEMS.indexOf(a.item) - ITEMS.indexOf(b.item) ||
      a.quantity - b.quantity,
  );
  const first = sorted[0];
  if (first && first.second > FIRST_DROP_BY) {
    // Moving the earliest drop earlier keeps it first, so the order stays sorted.
    sorted[0] = { ...first, second: rng("drops", "first").int(VAN_FROM, FIRST_DROP_BY + 1) };
  }
  return sorted.map((drop, i) => ({ dropId: `HB-${String(i + 1).padStart(4, "0")}`, ...drop }));
}

/** The clean feed row for a drop, before anything possesses it. */
export function dropRow(drop: Drop): Row {
  return {
    drop_id: drop.dropId,
    house_id: drop.houseId,
    item: drop.item,
    qty: drop.quantity,
    dropped_at: clockAt(drop.second).local,
  };
}
