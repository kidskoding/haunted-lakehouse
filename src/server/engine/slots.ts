import "server-only";

export type Slot = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10;

export type Tier = 1 | 2 | 3 | 4 | 5;

export type Act = 1 | 2 | 3;

export interface SlotDefinition {
  readonly slot: Slot;
  /** Local wall-clock time the hour opens, as shown on the clock. */
  readonly time: string;
  readonly tier: Tier;
  readonly act: Act;
  readonly boss: boolean;
}

/**
 * The night's fixed shape. Tiers live on the slot, not the puzzle, so the difficulty ramp
 * holds whichever puzzle a run draws from each pool.
 */
export const SLOTS: readonly SlotDefinition[] = [
  { slot: 1, time: "18:00", tier: 1, act: 1, boss: false },
  { slot: 2, time: "18:45", tier: 2, act: 1, boss: false },
  { slot: 3, time: "19:30", tier: 2, act: 1, boss: true },
  { slot: 4, time: "20:15", tier: 3, act: 2, boss: false },
  { slot: 5, time: "21:00", tier: 3, act: 2, boss: false },
  { slot: 6, time: "21:45", tier: 3, act: 2, boss: false },
  { slot: 7, time: "22:30", tier: 4, act: 2, boss: true },
  { slot: 8, time: "23:15", tier: 4, act: 3, boss: false },
  { slot: 9, time: "01:00", tier: 5, act: 3, boss: false },
  { slot: 10, time: "02:00", tier: 5, act: 3, boss: true },
];

export function isSlot(value: number): value is Slot {
  return Number.isInteger(value) && value >= 1 && value <= SLOTS.length;
}

export function slotDefinition(slot: Slot): SlotDefinition {
  const definition = SLOTS[slot - 1];
  if (!definition) throw new RangeError(`No slot ${String(slot)}.`);
  return definition;
}

/** Candles a failed "Run the night" costs in `slot`: a boss takes two. */
export function failureCost(slot: Slot): number {
  return slotDefinition(slot).boss ? 2 : 1;
}
