import "server-only";
import type { Arrival } from "../../batches/schedule";
import { isLit, type PorchLight, type PorchLightEvent } from "../../world/porch-lights";
import { FEED, HOUR_END, type CheckpointId } from "./plan";

export interface NarrativeInputs {
  readonly houseCount: number;
  readonly lights: readonly PorchLight[];
  readonly events: readonly PorchLightEvent[];
  readonly arrivals: readonly Arrival[];
  /** The houses counted welcoming at each checkpoint. */
  readonly welcoming: ReadonlyMap<CheckpointId, readonly string[]>;
}

/**
 * The numbers the hour's story and autopsy quote, all from this run's night, keyed by the
 * story's placeholder names.
 */
export function narrativeBindings(inputs: NarrativeInputs): Record<string, number> {
  const { houseCount, lights, events, arrivals, welcoming } = inputs;
  const at = (id: CheckpointId): readonly string[] => {
    const houses = welcoming.get(id);
    if (!houses) throw new Error(`No welcoming houses for the ${id} checkpoint.`);
    return houses;
  };

  // Every porch ever reported on; every arrival lands by the last checkpoint. The trap's number.
  const everLit = new Set(
    arrivals.flatMap((a) => {
      const event = a.feed === FEED ? events[a.source] : undefined;
      return event?.state === "on" ? [event.houseId] : [];
    }),
  );

  const diedInHour = (light: PorchLight): boolean =>
    light.diesAt !== null && light.diesAt <= HOUR_END;
  const lightOf = new Map(lights.map((l) => [l.houseId, l]));
  // Counted welcoming only because the sensor died before reporting that the light went off.
  const darkButCounted = at("quarter-to").filter((houseId) => {
    const light = lightOf.get(houseId);
    if (!light) throw new Error(`House ${houseId} has no porch light.`);
    return diedInHour(light) && !isLit(light, HOUR_END);
  }).length;

  return {
    house_count: houseCount,
    lit_at_quarter_past: at("quarter-past").length,
    lit_at_half_past: at("half-past").length,
    lit_at_last_checkpoint: at("quarter-to").length,
    ever_lit: everLit.size,
    switched_off: everLit.size - at("quarter-to").length,
    silent_sensors: lights.filter(diedInHour).length,
    dark_but_counted: darkButCounted,
    truly_lit: lights.filter((l) => isLit(l, HOUR_END)).length,
  };
}
