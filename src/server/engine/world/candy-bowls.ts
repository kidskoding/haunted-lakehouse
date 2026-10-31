import "server-only";
import type { Row } from "../puzzle";
import type { Rng } from "../random";
import { CANDY_CATALOG, type Candy } from "./candy";
import { byText, deviceIds } from "./device-ids";
import type { DoorScan } from "./door-scans";
import type { House } from "./houses";
import { clockAt, NIGHT_SECONDS, type UtcOffset } from "./night-clock";
import type { PorchLight } from "./porch-lights";
import { townRng, weighted } from "./town";

/** The pieces one kid took at one door, tied to the scan that recorded the visit. */
export interface CandyHandout {
  readonly houseId: string;
  readonly kidId: string;
  readonly scanDeviceId: string;
  readonly scanSeq: number;
  readonly nightSecond: number;
  readonly candyType: string;
  readonly pieces: number;
}

/** A whole bag tipped into the bowl. */
export interface Refill {
  readonly nightSecond: number;
  readonly pieces: number;
}

/** One candy-giving household's bowl and the scale under it, with its true history. */
export interface CandyBowl {
  readonly deviceId: string;
  readonly houseId: string;
  readonly candyType: string;
  /** When the filled bowl went out on the porch, and when it came back in. */
  readonly setOutAt: number;
  readonly takenInAt: number;
  readonly initialPieces: number;
  readonly refills: readonly Refill[];
}

/** One weight the scale reported. */
export interface BowlReading {
  readonly deviceId: string;
  /** Per device, 1, 2, 3, ... in the order the scale read them. */
  readonly seq: number;
  readonly houseId: string;
  /** True time, in seconds since 18:00 CDT. Never shipped. */
  readonly nightSecond: number;
  /** Candy in the bowl, tared, in whole grams, with the scale's measurement noise. */
  readonly weightG: number;
  readonly readAtLocal: string;
  readonly utcOffset: UtcOffset;
}

export interface CandyBowlFeed {
  readonly bowls: readonly CandyBowl[];
  readonly handouts: readonly CandyHandout[];
  readonly readings: readonly BowlReading[];
}

const MINUTE = 60;
const HOUR = 3600;

/*
 * The scale reports when its weight settles after a change, the way a smart scale does, plus
 * a heartbeat after 15 quiet minutes. On-change rather than a fixed cadence keeps the feed
 * small and makes most readings one visit apart, but a busy door still lumps several visits
 * (and sometimes a refill) into one change, and heartbeats show noise with no visit behind it.
 */
const SETTLE = 30;
const HEARTBEAT = 15 * MINUTE;
const NOISE_G = 2;

// A household tops the bowl up once it looks low: below what a couple of groups would take.
const LOW_PIECES = 15;

/** How freely a household hands out candy, as weights for one, two, or three pieces. */
const GENEROSITY: readonly (readonly [readonly [number, number, number], number])[] = [
  [[8, 2, 0], 3],
  [[5, 4, 1], 5],
  [[2, 5, 3], 2],
];

/*
 * The Hollow marks a few houses each night: a marked house gives out exactly 13 pieces all
 * night. It can only mark a house that sees 5 to 13 kids, since every kid takes 1 to 3.
 */
const CURSED = 13;
const MARK_CHANCE = 0.5;
const MAX_MARKS = 4;

function markedHouses(runSeed: string, visitsAt: ReadonlyMap<string, readonly DoorScan[]>) {
  const rng = townRng(runSeed, "candy-bowls:curse");
  const marked = new Set<string>();
  const houseIds = [...visitsAt.keys()].sort(byText);
  for (const houseId of houseIds) {
    const visits = visitsAt.get(houseId)?.length ?? 0;
    const eligible = visits * 3 >= CURSED && visits <= CURSED;
    if (eligible && rng.float() < MARK_CHANCE && marked.size < MAX_MARKS) marked.add(houseId);
  }
  return marked;
}

/** Pieces per visit: drawn from the household's habits, or dealt out to total exactly 13. */
function piecesPerVisit(rng: Rng, visits: number, marked: boolean): number[] {
  if (!marked) {
    const [one, two, three] = weighted(rng, GENEROSITY);
    return Array.from({ length: visits }, () =>
      weighted(rng, [
        [1, one],
        [2, two],
        [3, three],
      ]),
    );
  }
  const pieces = Array.from({ length: visits }, () => 1);
  for (let extra = CURSED - visits; extra > 0; extra--) {
    const open = pieces.flatMap((p, i) => (p < 3 ? [i] : []));
    const i = rng.pick(open);
    pieces[i] = (pieces[i] ?? 0) + 1;
  }
  return pieces;
}

/** A change to the bowl's true contents, in pieces. */
interface Change {
  readonly nightSecond: number;
  readonly pieces: number;
}

/** When a porch first lights up and when it goes dark for the night. */
interface Porch {
  readonly on: number;
  readonly off: number;
}

interface Simulation {
  readonly bowl: CandyBowl;
  readonly handouts: CandyHandout[];
  readonly changes: Change[];
}

function simulate(
  rng: Rng,
  house: House,
  deviceId: string,
  candy: Candy,
  porch: Porch,
  visits: readonly DoorScan[],
  pieces: readonly number[],
): Simulation {
  const first = visits[0]?.nightSecond;
  const last = visits.at(-1)?.nightSecond;
  // The bowl goes out once the porch is lit and comes in by the time the light goes off.
  // The porch lights up before the first knock and stays lit past the last, so both fit.
  const setOutAt = Math.max(
    porch.on,
    first === undefined ? rng.int(0, 30 * MINUTE) : first - rng.int(MINUTE, 15 * MINUTE),
  );
  const takenInAt = Math.min(
    NIGHT_SECONDS - 1,
    porch.off,
    last === undefined
      ? setOutAt + rng.int(HOUR, 3 * HOUR)
      : last + rng.int(5 * MINUTE, 45 * MINUTE),
  );
  const initialPieces = candy.piecesPerBag * rng.int(1, 3);

  let stock = initialPieces;
  let previous = setOutAt;
  let pending: number | null = null;
  const refills: Refill[] = [];
  const changes: Change[] = [];
  const handouts: CandyHandout[] = [];
  // Bags go in at or after the last change, so the change list stays in time order.
  const refill = (nightSecond: number) => {
    stock += candy.piecesPerBag;
    refills.push({ nightSecond, pieces: candy.piecesPerBag });
    changes.push({ nightSecond, pieces: candy.piecesPerBag });
    previous = nightSecond;
  };

  for (const [i, scan] of visits.entries()) {
    const take = pieces[i] ?? 1;
    if (pending !== null && pending < scan.nightSecond) {
      refill(pending);
      pending = null;
    }
    // Caught short with a kid at the door: the household tears open a bag on the spot.
    if (stock < take) {
      refill(Math.max(previous, scan.nightSecond - rng.int(3, 16)));
      pending = null;
    }
    stock -= take;
    previous = scan.nightSecond;
    changes.push({ nightSecond: scan.nightSecond, pieces: -take });
    handouts.push({
      houseId: house.houseId,
      kidId: scan.kidId,
      scanDeviceId: scan.deviceId,
      scanSeq: scan.seq,
      nightSecond: scan.nightSecond,
      candyType: candy.candyType,
      pieces: take,
    });
    if (pending === null && stock < LOW_PIECES)
      pending = scan.nightSecond + rng.int(20, 5 * MINUTE);
  }
  if (pending !== null && pending + SETTLE < takenInAt) refill(pending);

  return {
    bowl: {
      deviceId,
      houseId: house.houseId,
      candyType: candy.candyType,
      setOutAt,
      takenInAt,
      initialPieces,
      refills,
    },
    handouts,
    changes,
  };
}

/**
 * When the scale reads: as the bowl goes out, once each burst of changes settles, after every
 * quiet stretch of HEARTBEAT, and as the bowl comes in.
 */
function readingTimes(rng: Rng, bowl: CandyBowl, changes: readonly Change[]): number[] {
  const settled: number[] = [bowl.setOutAt];
  changes.forEach((change, i) => {
    const next = changes[i + 1]?.nightSecond ?? bowl.takenInAt;
    // Bursts end when nothing else lands within SETTLE, so this reading precedes the next change.
    if (next - change.nightSecond > SETTLE) {
      settled.push(Math.min(change.nightSecond + rng.int(5, SETTLE), bowl.takenInAt - 1));
    }
  });
  settled.push(bowl.takenInAt);

  const times: number[] = [];
  settled.forEach((t, i) => {
    times.push(t);
    const next = settled[i + 1];
    if (next === undefined) return;
    for (let beat = t + HEARTBEAT; beat < next - MINUTE; beat += HEARTBEAT) times.push(beat);
  });
  return times;
}

function weightAt(bowl: CandyBowl, changes: readonly Change[], second: number, grams: number) {
  const pieces = changes
    .filter((c) => c.nightSecond <= second)
    .reduce((sum, c) => sum + c.pieces, bowl.initialPieces);
  return pieces * grams;
}

/**
 * Every candy-giving house's bowl, out on the porch only between lighting up and switching
 * off for the night: what each kid took, when the household refilled, and what the scale
 * reported, sorted by true time then device. Clean and on time: the batch
 * scheduler adds resends and delays.
 */
export function generateCandyBowls(
  runSeed: string,
  houses: readonly House[],
  scans: readonly DoorScan[],
  lights: readonly PorchLight[],
): CandyBowlFeed {
  const giving = houses.filter((h) => h.givesCandy);
  const ids = deviceIds(
    townRng(runSeed, "candy-bowls:devices"),
    "BWL",
    giving.map((h) => h.houseId),
  );
  const porches = new Map(lights.map((l) => [l.houseId, l.lit]));
  const visitsAt = Map.groupBy(scans, (s) => s.houseId);
  const marked = markedHouses(runSeed, visitsAt);
  const candies = CANDY_CATALOG.map((c) => [c, c.popularity] as const);

  const bowls: CandyBowl[] = [];
  const handouts: CandyHandout[] = [];
  const unsorted: Omit<BowlReading, "readAtLocal" | "utcOffset">[] = [];
  for (const house of giving) {
    const deviceId = ids.get(house.houseId);
    if (!deviceId) throw new RangeError(`House ${house.houseId} has no bowl scale.`);
    const lit = porches.get(house.houseId) ?? [];
    const [on, off] = [lit[0]?.from, lit.at(-1)?.to];
    if (on === undefined || off === undefined) {
      throw new RangeError(`House ${house.houseId} gives candy but never lights its porch.`);
    }
    // A stream per house, so one bowl's draws never shift another's.
    const rng = townRng(runSeed, `candy-bowls/${house.houseId}`);
    const candy = weighted(rng, candies);
    const visits = visitsAt.get(house.houseId) ?? [];
    const pieces = piecesPerVisit(rng, visits.length, marked.has(house.houseId));
    const run = simulate(rng, house, deviceId, candy, { on, off }, visits, pieces);
    bowls.push(run.bowl);
    handouts.push(...run.handouts);
    readingTimes(rng, run.bowl, run.changes).forEach((nightSecond, i) => {
      const truth = weightAt(run.bowl, run.changes, nightSecond, candy.gramsPerPiece);
      const noise = rng.int(-NOISE_G, NOISE_G + 1);
      unsorted.push({
        deviceId,
        seq: i + 1,
        houseId: house.houseId,
        nightSecond,
        weightG: Math.max(0, truth + noise),
      });
    });
  }

  handouts.sort(
    (a, b) =>
      a.nightSecond - b.nightSecond ||
      byText(a.scanDeviceId, b.scanDeviceId) ||
      a.scanSeq - b.scanSeq,
  );
  const readings = unsorted
    .sort((a, b) => a.nightSecond - b.nightSecond || byText(a.deviceId, b.deviceId))
    .map((reading) => {
      const clock = clockAt(reading.nightSecond);
      return { ...reading, readAtLocal: clock.local, utcOffset: clock.utcOffset };
    });
  return { bowls, handouts, readings };
}

/** The `candy_bowls` feed: weights as the scales sent them. */
export function bowlReadingRows(readings: readonly BowlReading[]): Row[] {
  return readings.map((r) => ({
    device_id: r.deviceId,
    seq: r.seq,
    house_id: r.houseId,
    weight_g: r.weightG,
    read_at_local: r.readAtLocal,
    utc_offset: r.utcOffset,
  }));
}

/** Which candy each bowl holds: the household's order from the Co-op. */
export function bowlStockRows(bowls: readonly CandyBowl[]): Row[] {
  return bowls.map((b) => ({
    device_id: b.deviceId,
    house_id: b.houseId,
    candy_type: b.candyType,
  }));
}
