import "server-only";
import { NIGHT_SECONDS } from "../world/night-clock";

/**
 * When batches land, in night seconds. Either a steady drip (`every` seconds from `from`
 * through `until`, both landing if the step reaches them) or an explicit list of landings.
 */
export type Cadence =
  | { readonly every: number; readonly from: number; readonly until: number }
  | { readonly at: readonly number[] };

/** The landing second of every batch, earliest first. Rejects landings outside the night. */
export function landingSeconds(cadence: Cadence): number[] {
  let landings: number[];
  if ("at" in cadence) {
    landings = [...cadence.at];
  } else {
    const { every, from, until } = cadence;
    if (!Number.isInteger(every) || every < 1) {
      throw new RangeError(`A cadence must step by a whole positive second, not ${String(every)}.`);
    }
    landings = [];
    for (let second = from; second <= until; second += every) landings.push(second);
  }

  if (landings.length === 0) throw new RangeError("A cadence must land at least one batch.");
  landings.forEach((second, i) => {
    if (!Number.isInteger(second) || second < 0 || second > NIGHT_SECONDS) {
      throw new RangeError(`Batch landing ${String(second)} is not a whole second of the night.`);
    }
    const previous = landings[i - 1];
    if (previous !== undefined && second <= previous) {
      throw new RangeError("Batch landings must strictly increase.");
    }
  });
  return landings;
}

/** The first batch landing at or after `second`, or undefined when none is left in the night. */
export function batchLandingBy(landings: readonly number[], second: number): number | undefined {
  // Landings are sorted, so a binary search keeps scheduling ten thousand rows cheap.
  let low = 0;
  let high = landings.length;
  while (low < high) {
    const mid = (low + high) >>> 1;
    if ((landings[mid] ?? Infinity) < second) low = mid + 1;
    else high = mid;
  }
  return low < landings.length ? low : undefined;
}
