import "server-only";
import type { Row } from "../puzzle";
import type { Rng } from "../random";
import { byText, deviceIds } from "./device-ids";
import type { DoorScan } from "./door-scans";
import type { House } from "./houses";
import { clockAt, NIGHT_SECONDS, type UtcOffset } from "./night-clock";
import { townRng } from "./town";

/** A stretch of the night with the porch light on: from `from` up to, not including, `to`. */
export interface LitSpan {
  readonly from: number;
  /** When the light went off, or NIGHT_SECONDS if it was still on at 03:00. */
  readonly to: number;
}

/** One porch's light and the sensor watching it. */
export interface PorchLight {
  readonly deviceId: string;
  readonly houseId: string;
  /** The true light history, in time order, never overlapping or touching. */
  readonly lit: readonly LitSpan[];
  /**
   * The night second the sensor's battery died, or null if it lasted the night. Changes at
   * or after this second really happened but were never reported.
   */
  readonly diesAt: number | null;
}

export type LightState = "on" | "off";

/** One state change the sensor reported. */
export interface PorchLightEvent {
  readonly deviceId: string;
  /** Per device, 1, 2, 3, ... in the order the changes happened. */
  readonly seq: number;
  readonly houseId: string;
  readonly state: LightState;
  /** True time, in seconds since 18:00 CDT. Never shipped. */
  readonly nightSecond: number;
  readonly changedAtLocal: string;
  readonly utcOffset: UtcOffset;
}

export interface PorchLightFeed {
  readonly lights: readonly PorchLight[];
  readonly events: readonly PorchLightEvent[];
}

const MINUTE = 60;
const HOUR = 3600;

// Most porches light up at dusk; a few households get home late and switch on just in time.
const LATE_LIGHTING = 0.2;
// A long lull between visitors sometimes means the household stepped away and switched off.
const LULL = 45 * MINUTE;
const BREAK_CHANCE = 0.25;
// A dark house's light still gets flicked on now and then: someone taking out the trash.
const FLICK_CHANCE = 0.2;
// Some porch lights are on dusk timers. At a dark house the timer lights the porch anyway,
// until someone remembers what night it is and switches it off.
const TIMER_CHANCE = 0.35;
// A minority of cheap battery sensors die partway through the night.
const SILENT_CHANCE = 0.1;

/** Is the light truly on at this night second? */
export function isLit(light: PorchLight, second: number): boolean {
  return light.lit.some((span) => second >= span.from && second < span.to);
}

/**
 * What the sensor's own reports say about this night second: the true state as of the last
 * change it lived to report. Off before any report, since every light starts the night off.
 */
export function lastReportedState(light: PorchLight, second: number): LightState {
  const seen = light.diesAt === null ? second : Math.min(second, light.diesAt - 1);
  return isLit(light, seen) ? "on" : "off";
}

/** A giving house is lit from before its first visitor until after its last, with maybe a break. */
function givingSpans(rng: Rng, visits: readonly number[]): LitSpan[] {
  const first = visits[0];
  const last = visits.at(-1);
  if (first === undefined || last === undefined) {
    // Ready for visitors who never came; the household gives up after a while.
    const from = rng.int(0, 30 * MINUTE);
    return [{ from, to: from + rng.int(HOUR, 4 * HOUR) }];
  }
  const dusk =
    rng.float() < LATE_LIGHTING ? rng.int(30 * MINUTE, 90 * MINUTE) : rng.int(0, 30 * MINUTE);
  // People only knock at lit porches, so the light is always on by the first knock.
  let from = Math.max(0, Math.min(dusk, first - rng.int(30, 10 * MINUTE)));
  const spans: LitSpan[] = [];
  for (let i = 1; i < visits.length; i++) {
    const [prev, next] = [visits[i - 1] ?? 0, visits[i] ?? 0];
    if (next - prev < LULL || rng.float() >= BREAK_CHANCE) continue;
    spans.push({ from, to: prev + rng.int(5 * MINUTE, Math.floor((next - prev) / 2)) });
    from = next - rng.int(MINUTE, 5 * MINUTE);
  }
  spans.push({ from, to: Math.min(NIGHT_SECONDS, last + rng.int(5 * MINUTE, HOUR)) });
  return spans;
}

/**
 * A dark house usually stays dark. A dusk timer may light it for a while at the start of the
 * night, and now and then someone flicks the light on for a few minutes.
 */
function darkSpans(rng: Rng): LitSpan[] {
  const spans: LitSpan[] = [];
  if (rng.float() < TIMER_CHANCE) {
    const from = rng.int(0, 10 * MINUTE);
    spans.push({ from, to: from + rng.int(3 * MINUTE, 30 * MINUTE) });
  }
  if (rng.float() >= FLICK_CHANCE) return spans;
  const flicks = rng.int(1, 3);
  for (let i = 0; i < flicks; i++) {
    const from = rng.int(0, NIGHT_SECONDS - 20 * MINUTE);
    const to = from + rng.int(MINUTE, 10 * MINUTE);
    // Overlapping flicks would be one longer one; keep only those clear of the others.
    if (spans.every((s) => to + MINUTE < s.from || from > s.to + MINUTE)) spans.push({ from, to });
  }
  return spans.sort((a, b) => a.from - b.from);
}

function changes(spans: readonly LitSpan[]): { state: LightState; nightSecond: number }[] {
  return spans.flatMap((span) => [
    { state: "on" as const, nightSecond: span.from },
    ...(span.to < NIGHT_SECONDS ? [{ state: "off" as const, nightSecond: span.to }] : []),
  ]);
}

/** Dies between two changes, so at least the first is reported and at least the last is lost. */
function battery(rng: Rng, times: readonly number[]): number | null {
  if (times.length < 2 || rng.float() >= SILENT_CHANCE) return null;
  const k = rng.int(1, times.length);
  return rng.int((times[k - 1] ?? 0) + 1, (times[k] ?? 0) + 1);
}

/**
 * Every porch light of the night and the state changes its sensor reported, sorted by true
 * time then device. Clean and on time: the batch scheduler adds resends and delays.
 */
export function generatePorchLights(
  runSeed: string,
  houses: readonly House[],
  scans: readonly DoorScan[],
): PorchLightFeed {
  const ids = deviceIds(
    townRng(runSeed, "porch-lights:devices"),
    "PL",
    houses.map((h) => h.houseId),
  );
  const visitsAt = Map.groupBy(scans, (s) => s.houseId);
  const lights: PorchLight[] = [];
  const unsorted: Omit<PorchLightEvent, "changedAtLocal" | "utcOffset">[] = [];

  for (const house of houses) {
    const deviceId = ids.get(house.houseId);
    if (!deviceId) throw new RangeError(`House ${house.houseId} has no porch light.`);
    // A stream per house, so one porch's draws never shift another's.
    const rng = townRng(runSeed, `porch-lights/${house.houseId}`);
    const visits = (visitsAt.get(house.houseId) ?? []).map((s) => s.nightSecond);
    const lit = house.givesCandy ? givingSpans(rng, visits) : darkSpans(rng);
    const truth = changes(lit);
    const diesAt = battery(
      rng,
      truth.map((c) => c.nightSecond),
    );
    lights.push({ deviceId, houseId: house.houseId, lit, diesAt });
    truth
      .filter((c) => diesAt === null || c.nightSecond < diesAt)
      .forEach((c, i) => unsorted.push({ deviceId, seq: i + 1, houseId: house.houseId, ...c }));
  }

  const events = unsorted
    .sort((a, b) => a.nightSecond - b.nightSecond || byText(a.deviceId, b.deviceId))
    .map((event) => {
      const clock = clockAt(event.nightSecond);
      return { ...event, changedAtLocal: clock.local, utcOffset: clock.utcOffset };
    });
  return { lights, events };
}

/** The `porch_lights` feed: state changes as the sensors sent them. */
export function porchLightRows(events: readonly PorchLightEvent[]): Row[] {
  return events.map((e) => ({
    device_id: e.deviceId,
    seq: e.seq,
    house_id: e.houseId,
    state: e.state,
    changed_at_local: e.changedAtLocal,
    utc_offset: e.utcOffset,
  }));
}
