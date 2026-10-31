import type { ActNumber, TopBarSlot, TopBarView } from "./types";

const TIME = /^([01]\d|2[0-3]):([0-5]\d)$/;

function parse(time: string): { readonly hours: number; readonly minutes: number } {
  const match = TIME.exec(time);
  if (!match) throw new RangeError(`"${time}" is not an HH:MM time.`);
  return { hours: Number(match[1]), minutes: Number(match[2]) };
}

/** A slot time as the town's clocks print it: "19:30" reads "7:30pm", "00:15" reads "12:15am". */
export function clockLabel(time: string): string {
  const { hours, minutes } = parse(time);
  const twelve = hours % 12 === 0 ? 12 : hours % 12;
  return `${String(twelve)}:${String(minutes).padStart(2, "0")}${hours < 12 ? "am" : "pm"}`;
}

/**
 * The dial hand's angle in degrees, clockwise from 12. It counts on from 6pm instead of
 * wrapping at midnight, so the hand only ever sweeps forward through the night (11:15pm to
 * 1:00am turns 52.5 degrees on, not 307.5 back). The night ends at 3am, so the morning
 * hours are always the far side of midnight.
 */
export function dialAngle(time: string): number {
  const { hours, minutes } = parse(time);
  const sinceSix = (hours - 18 + 24) % 24;
  return 180 + (sinceSix + minutes / 60) * 30;
}

const ACTS: Readonly<Record<ActNumber, { readonly numeral: string; readonly name: string }>> = {
  1: { numeral: "I", name: "Dusk" },
  2: { numeral: "II", name: "Night" },
  3: { numeral: "III", name: "The Witching Hour" },
};

export function actName(act: ActNumber): { readonly numeral: string; readonly name: string } {
  return ACTS[act];
}

/** The hour the view points at. A view whose slot isn't in its own list is a caller's bug. */
export function currentSlot(view: Pick<TopBarView, "slot" | "slots">): TopBarSlot {
  const found = view.slots.find((slot) => slot.slot === view.slot);
  if (!found) throw new RangeError(`Slot ${String(view.slot)} is not on the night's clock.`);
  return found;
}

/** What a screen reader hears for one slot marker. */
export function slotSpoken(slot: TopBarSlot, current: number): string {
  const parts = [`Hour ${String(slot.slot)}`, clockLabel(slot.time)];
  if (slot.repeat) parts.push("the second time");
  parts.push(`Act ${String(slot.act)}`);
  if (slot.boss) parts.push("boss");
  if (slot.slot < current) parts.push("passed");
  else if (slot.slot === current) parts.push("now");
  return parts.join(", ");
}

/**
 * The candles that just went out: those lit before and out now, as indices from the left.
 * Candles burn down from the right, so the leftmost `lit` stay lit.
 */
export function justSnuffed(previousLit: number, lit: number): readonly number[] {
  const out: number[] = [];
  for (let index = Math.max(lit, 0); index < previousLit; index += 1) out.push(index);
  return out;
}
