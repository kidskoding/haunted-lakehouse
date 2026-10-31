import "server-only";
import type { Arrival } from "../../batches/schedule";
import { byText } from "../../world/device-ids";
import type { PorchLightEvent } from "../../world/porch-lights";
import { FEED } from "./plan";

export const GOLD_TABLE = "gold.welcoming_houses";

/**
 * Each house's last word by a checkpoint: of its reports delivered in batches up to and
 * including `afterBatch`, the one with the greatest `seq`. Arrival order never matters.
 */
export function lastWords(
  events: readonly PorchLightEvent[],
  arrivals: readonly Arrival[],
  afterBatch: number,
): Map<string, PorchLightEvent> {
  const latest = new Map<string, PorchLightEvent>();
  for (const arrival of arrivals) {
    if (arrival.feed !== FEED || arrival.batch > afterBatch) continue;
    const event = events[arrival.source];
    if (!event) throw new Error(`Arrival points at missing event ${String(arrival.source)}.`);
    const known = latest.get(event.houseId);
    if (!known || event.seq > known.seq) latest.set(event.houseId, event);
  }
  return latest;
}

/** A house is welcoming when its last word is `on`; a house never heard from is dark. */
export function welcomingHouses(words: ReadonlyMap<string, PorchLightEvent>): string[] {
  return [...words.values()]
    .filter((e) => e.state === "on")
    .map((e) => e.houseId)
    .sort(byText);
}
