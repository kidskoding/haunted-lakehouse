import "server-only";
import type { Row } from "../puzzle";
import type { Rng } from "../random";
import type { DoorScan } from "./door-scans";
import { clockAt, type UtcOffset } from "./night-clock";
import { townRng } from "./town";
import type { TrickOrTreater } from "./trick-or-treaters";

/** The wagon's stops. Fixed, so the story can name them; every run's wagon runs the same loop. */
export const HAYRIDE_GATES = ["Town Green", "Old Mill", "Graveyard Gate"] as const;

export type HayrideGate = (typeof HAYRIDE_GATES)[number];

export type TapDirection = "in" | "out";

/**
 * One kid's tap at a hayride gate reader, as it truly happened. Later stages resend, delay,
 * and reorder these; this is the clean record they start from.
 */
export interface HayrideTap {
  /** The reader at the gate. Each gate has exactly one. */
  readonly deviceId: string;
  /** Per device, 1, 2, 3, ... in the order the reader logged them. */
  readonly seq: number;
  readonly gate: HayrideGate;
  readonly kidId: string;
  /** `in` on boarding the wagon, `out` on leaving it. */
  readonly direction: TapDirection;
  /** True time, in seconds since 18:00 CDT. Never shipped: it is what the clock faces encode. */
  readonly nightSecond: number;
  /** The reader's wall clock, logged with its offset exactly as the door scanners do. */
  readonly tappedAtLocal: string;
  readonly utcOffset: UtcOffset;
}

const MINUTE = 60;

/** The wagon runs from 18:30 to 23:00 CDT, as night seconds. Every tap falls inside. */
export const HAYRIDE_OPENS = 30 * MINUTE;
export const HAYRIDE_CLOSES = 5 * 60 * MINUTE;

// About one group in four takes the wagon, and some of those like it enough to go again.
const RIDE_CHANCE = 0.25;
const SECOND_RIDE_CHANCE = 0.25;

/** A stretch of the night when a group is free of doors and earlier rides, both ends exclusive. */
interface Gap {
  readonly after: number | null;
  readonly before: number | null;
}

/** A ride's shape before it is placed: how long each part takes and who taps when. */
interface RidePlan {
  readonly walkIn: number;
  readonly walkOut: number;
  readonly boardGate: HayrideGate;
  readonly leaveGate: HayrideGate;
  /** Seconds from the first tap-in to each member's tap-in, in tap order. */
  readonly tapIns: readonly (readonly [string, number])[];
  /** Seconds from the first tap-in to each member's tap-out, in tap order. */
  readonly tapOuts: readonly (readonly [string, number])[];
  /** Seconds from the first tap-in to the last tap-out. */
  readonly span: number;
}

interface TrueTap {
  readonly deviceId: string;
  readonly gate: HayrideGate;
  readonly kidId: string;
  readonly direction: TapDirection;
  readonly nightSecond: number;
}

/** Reader ids, one per gate, in gate order. */
function assignReaders(runSeed: string): Map<HayrideGate, string> {
  const rng = townRng(runSeed, "hayride:devices");
  const taken = new Set<string>();
  const readers = new Map<HayrideGate, string>();
  for (const gate of HAYRIDE_GATES) {
    let id: string;
    do {
      id = `HAY-${rng.int(0, 0x10000).toString(16).toUpperCase().padStart(4, "0")}`;
    } while (taken.has(id));
    taken.add(id);
    readers.set(gate, id);
  }
  return readers;
}

/** Members tap a few seconds apart, in a different order each time, like at a door. */
function tapSequence(rng: Rng, kidIds: readonly string[], from: number): [string, number][] {
  const order = [...kidIds];
  const taps: [string, number][] = [];
  let at = from;
  while (order.length > 0) {
    const [kidId] = order.splice(rng.int(0, order.length), 1);
    if (kidId === undefined) break;
    taps.push([kidId, at]);
    at += rng.int(2, 9);
  }
  return taps;
}

function planRide(rng: Rng, kidIds: readonly string[]): RidePlan {
  const walkIn = rng.int(4 * MINUTE, 12 * MINUTE);
  const walkOut = rng.int(4 * MINUTE, 12 * MINUTE);
  const boardGate = rng.pick(HAYRIDE_GATES);
  // The wagon loops, so a group may ride all the way round and step off where it got on.
  const leaveGate = rng.pick(HAYRIDE_GATES);
  const tapIns = tapSequence(rng, kidIds, 0);
  // The wagon pulls away once the last member has tapped in.
  const departs = tapIns.at(-1)?.[1] ?? 0;
  const tapOuts = tapSequence(rng, kidIds, departs + rng.int(10 * MINUTE, 25 * MINUTE + 1));
  const span = tapOuts.at(-1)?.[1] ?? departs;
  return { walkIn, walkOut, boardGate, leaveGate, tapIns, tapOuts, span };
}

/** The free stretches between a group's busy moments, plus the open ends of the night. */
function gapsBetween(busy: readonly number[]): Gap[] {
  const sorted = [...busy].sort((a, b) => a - b);
  const bounds = [null, ...sorted, null];
  return bounds.slice(1).map((before, i) => ({ after: bounds[i] ?? null, before }));
}

/**
 * Where a ride can start inside a gap, as the earliest and latest first tap-in, or null if it
 * doesn't fit. A group needs time to walk from its last door to the gate and from the wagon to
 * its next door, so no member can scan a door while on board.
 */
function window(gap: Gap, ride: RidePlan): readonly [number, number] | null {
  const earliest = Math.max(HAYRIDE_OPENS, gap.after === null ? 0 : gap.after + ride.walkIn);
  const latestEnd = Math.min(
    HAYRIDE_CLOSES,
    gap.before === null ? HAYRIDE_CLOSES : gap.before - ride.walkOut,
  );
  const latest = latestEnd - ride.span;
  return latest >= earliest ? [earliest, latest] : null;
}

/** Places one ride in a free gap, or returns null if none is long enough. */
function placeRide(
  rng: Rng,
  kidIds: readonly string[],
  busy: readonly number[],
  readers: ReadonlyMap<HayrideGate, string>,
): TrueTap[] | null {
  const ride = planRide(rng, kidIds);
  const windows = gapsBetween(busy)
    .map((gap) => window(gap, ride))
    .filter((w) => w !== null);
  if (windows.length === 0) return null;
  const [earliest, latest] = rng.pick(windows);
  const start = rng.int(earliest, latest + 1);

  const tap = (gate: HayrideGate, direction: TapDirection) => {
    const deviceId = readers.get(gate);
    if (!deviceId) throw new RangeError(`Gate ${gate} has no reader.`);
    return ([kidId, offset]: readonly [string, number]): TrueTap => ({
      deviceId,
      gate,
      kidId,
      direction,
      nightSecond: start + offset,
    });
  };
  return [
    ...ride.tapIns.map(tap(ride.boardGate, "in")),
    ...ride.tapOuts.map(tap(ride.leaveGate, "out")),
  ];
}

function byText(a: string, b: string): number {
  if (a === b) return 0;
  return a < b ? -1 : 1;
}

/**
 * Every hayride tap of the night, in true-time order. Whole groups ride together, and only in
 * a stretch when none of them is at a door: a kid on the wagon never scans a door. Door scans
 * are taken as given; a group whose evening has no room for a ride simply doesn't ride.
 */
export function generateHayrideTaps(
  runSeed: string,
  kids: readonly TrickOrTreater[],
  scans: readonly DoorScan[],
): HayrideTap[] {
  const readers = assignReaders(runSeed);
  const groupOf = new Map(kids.map((k) => [k.kidId, k.groupId]));
  const scanTimes = Map.groupBy(scans, (s) => groupOf.get(s.kidId) ?? "");
  const groups = [...Map.groupBy(kids, (k) => k.groupId)].sort(([a], [b]) => byText(a, b));

  const taps: TrueTap[] = [];
  for (const [groupId, members] of groups) {
    // Each group has its own stream, so one group's ride never shifts another's.
    const rng = townRng(runSeed, `hayride:${groupId}`);
    if (rng.float() >= RIDE_CHANCE) continue;
    const kidIds = members.map((k) => k.kidId).sort();
    const busy = (scanTimes.get(groupId) ?? []).map((s) => s.nightSecond);
    const rides = rng.float() < SECOND_RIDE_CHANCE ? 2 : 1;
    for (let r = 0; r < rides; r++) {
      const ride = placeRide(rng, kidIds, busy, readers);
      if (!ride) break;
      taps.push(...ride);
      // A later ride must leave the group time to walk off this one first.
      busy.push(...ride.map((t) => t.nightSecond));
    }
  }

  taps.sort(
    (a, b) =>
      a.nightSecond - b.nightSecond || byText(a.deviceId, b.deviceId) || byText(a.kidId, b.kidId),
  );
  const counters = new Map<string, number>();
  return taps.map((tap) => {
    const seq = (counters.get(tap.deviceId) ?? 0) + 1;
    counters.set(tap.deviceId, seq);
    const clock = clockAt(tap.nightSecond);
    return { ...tap, seq, tappedAtLocal: clock.local, utcOffset: clock.utcOffset };
  });
}

/** The `hayride_taps` feed: what the gate readers report, without the true time behind it. */
export function hayrideTapRows(taps: readonly HayrideTap[]): Row[] {
  return taps.map((tap) => ({
    device_id: tap.deviceId,
    seq: tap.seq,
    gate: tap.gate,
    kid_id: tap.kidId,
    direction: tap.direction,
    tapped_at_local: tap.tappedAtLocal,
    utc_offset: tap.utcOffset,
  }));
}
