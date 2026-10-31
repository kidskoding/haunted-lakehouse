import "server-only";
import type { Row } from "../puzzle";
import type { Rng } from "../random";
import { CANDY_CATALOG, type Candy } from "./candy";
import { byText, deviceIds } from "./device-ids";
import type { DoorScan } from "./door-scans";
import type { House } from "./houses";
import { clockAt, NIGHT_SECONDS, type UtcOffset } from "./night-clock";
import type { PorchLight } from "./porch-lights";
import { townRng, weighted, type Street } from "./town";

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
// Some households keep the bowl brimming instead, tipping in a bag once a few kids have been by.
const BRIMMING_SHARE = 0.25;
const BRIM_GAP = 8;

/** How freely a household hands out candy, as weights for one, two, or three pieces. */
const GENEROSITY: readonly (readonly [readonly [number, number, number], number])[] = [
  [[8, 2, 0], 3],
  [[5, 4, 1], 5],
  [[2, 5, 3], 2],
];

/*
 * The Hollow counts at the seven o'clock bell. Each house it marks has had exactly 13 pieces
 * taken from its bowl by the scale's last reading before the bell; visits after that follow
 * the household's habits like anyone else's.
 */
export const CURSE_BELL = HOUR;
const CURSED = 13;
const HAUNTED_MARKS = 3;
const STRAY_MARK_CHANCE = 0.3;

/**
 * Pieces per visit from the household's habits, except that a marked house's visits before
 * the bell are dealt out to total exactly 13.
 */
function piecesPerVisit(rng: Rng, visits: readonly DoorScan[], marked: boolean): number[] {
  const [one, two, three] = weighted(rng, GENEROSITY);
  const habit = () =>
    weighted(rng, [
      [1, one],
      [2, two],
      [3, three],
    ]);
  if (!marked) return visits.map(() => habit());
  const early = visits.map((v) => v.nightSecond < CURSE_BELL);
  const pieces = early.map((isEarly) => (isEarly ? 1 : habit()));
  for (let extra = CURSED - early.filter(Boolean).length; extra > 0; extra--) {
    const open = pieces.flatMap((p, i) => (early[i] === true && p < 3 ? [i] : []));
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
  brimming: boolean,
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
  const topUpBelow = brimming ? Math.max(LOW_PIECES, initialPieces - BRIM_GAP) : LOW_PIECES;

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
    if (pending === null && stock < topUpBelow)
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
 * quiet stretch of HEARTBEAT, and as the bowl comes in. It also reads in the second before a
 * change that would put a second bag, or a whole bag's worth of handouts, since its last
 * reading. So between neighbouring readings there is at most one refill and fewer than a bag
 * given, and every change in weight reads back exactly: a fall of n is n given, and a rise of
 * r is one bag in and bag - r given.
 */
function readingTimes(
  rng: Rng,
  bowl: CandyBowl,
  changes: readonly Change[],
  piecesPerBag: number,
): number[] {
  const settled: number[] = [bowl.setOutAt];
  let bags = 0;
  let given = 0;
  const fits = (more: readonly Change[]) =>
    bags + more.filter((c) => c.pieces > 0).length <= 1 &&
    given + more.reduce((sum, c) => sum + Math.max(0, -c.pieces), 0) < piecesPerBag;
  const read = (second: number) => {
    settled.push(second);
    bags = 0;
    given = 0;
  };
  changes.forEach((change, i) => {
    // Every split falls between seconds, so only one second's changes can break the bound.
    if (!fits([change])) {
      throw new RangeError(
        `Bowl ${bowl.deviceId} changed too much at ${String(change.nightSecond)}.`,
      );
    }
    if (change.pieces > 0) bags++;
    else given -= change.pieces;
    const next = changes[i + 1]?.nightSecond ?? bowl.takenInAt;
    // Bursts end when nothing else lands within SETTLE, so this reading precedes the next change.
    if (next - change.nightSecond > SETTLE) {
      read(Math.min(change.nightSecond + rng.int(5, SETTLE), bowl.takenInAt - 1));
    } else if (next > change.nightSecond && !fits(changes.filter((c) => c.nightSecond === next))) {
      read(next - 1);
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

type UnstampedReading = Omit<BowlReading, "readAtLocal" | "utcOffset">;

interface BowlRun extends Simulation {
  readonly readings: readonly UnstampedReading[];
}

const CANDY_ODDS = CANDY_CATALOG.map((c) => [c, c.popularity] as const);

function runBowl(
  runSeed: string,
  house: House,
  deviceId: string,
  porch: Porch,
  visits: readonly DoorScan[],
  marked: boolean,
): BowlRun {
  // A stream per house, so one bowl's draws never shift another's, and a trial run while
  // marking repeats the real one exactly.
  const rng = townRng(runSeed, `candy-bowls/${house.houseId}`);
  const candy = weighted(rng, CANDY_ODDS);
  const pieces = piecesPerVisit(rng, visits, marked);
  // Its own stream, so the habit leaves every other draw of the bowl where it was.
  const brimming =
    townRng(runSeed, `candy-bowls/${house.houseId}:brimming`).float() < BRIMMING_SHARE;
  const run = simulate(rng, house, deviceId, candy, porch, visits, pieces, brimming);
  const readings = readingTimes(rng, run.bowl, run.changes, candy.piecesPerBag).map(
    (nightSecond, i) => {
      const truth = weightAt(run.bowl, run.changes, nightSecond, candy.gramsPerPiece);
      const noise = rng.int(-NOISE_G, NOISE_G + 1);
      return {
        deviceId,
        seq: i + 1,
        houseId: house.houseId,
        nightSecond,
        weightG: Math.max(0, truth + noise),
      };
    },
  );
  return { ...run, readings };
}

/** The night second of a bowl's last reading before `second`, if it had one. */
function lastReadingBefore(readings: readonly { nightSecond: number }[], second: number) {
  let last: number | undefined;
  for (const { nightSecond } of readings) {
    if (nightSecond < second && (last === undefined || nightSecond > last)) last = nightSecond;
  }
  return last;
}

/**
 * The pieces one bowl's scale had seen taken by its last reading before `second`. A reading
 * weighs every change up to its own moment, so a handout counts once such a reading follows it.
 */
export function piecesRecordedBefore(
  handouts: readonly CandyHandout[],
  readings: readonly { nightSecond: number }[],
  second: number,
): number {
  const last = lastReadingBefore(readings, second);
  if (last === undefined) return 0;
  return handouts.filter((h) => h.nightSecond <= last).reduce((sum, h) => sum + h.pieces, 0);
}

interface Candidate {
  readonly house: House;
  /** The household refilled the bowl before the scale's last reading before the bell. */
  readonly refilledBeforeBell: boolean;
}

/**
 * Which houses the Hollow marks. A house qualifies when 5 to 12 kids came before the bell
 * (each takes 1 to 3; with 13 the door scanner's count would match by accident) and, dealt
 * 13 pieces, its scale records all 13 before the bell. The street it haunts takes up to three
 * marks, one of them a bowl refilled before the bell where it can, so the weight a street's
 * bowls lost by the bell never tells their tally alone. Other streets take at most one stray
 * mark each, and only when the haunted street has two, so it always has the most marks.
 */
function markHouses(
  runSeed: string,
  giving: readonly House[],
  visitsAt: ReadonlyMap<string, readonly DoorScan[]>,
  trial: (house: House) => BowlRun,
): Set<string> {
  const candidates: Candidate[] = [];
  for (const house of giving) {
    const early = (visitsAt.get(house.houseId) ?? []).filter((v) => v.nightSecond < CURSE_BELL);
    if (early.length * 3 < CURSED || early.length >= CURSED) continue;
    const run = trial(house);
    if (piecesRecordedBefore(run.handouts, run.readings, CURSE_BELL) !== CURSED) continue;
    const last = lastReadingBefore(run.readings, CURSE_BELL) ?? -1;
    candidates.push({
      house,
      refilledBeforeBell: run.bowl.refills.some((r) => r.nightSecond <= last),
    });
  }

  const byStreet = Map.groupBy(candidates, (c) => c.house.street);
  const streets = [...byStreet.keys()].sort(byText);
  const ofStreet = (street: Street) => byStreet.get(street) ?? [];
  const twoOrMore = streets.filter((s) => ofStreet(s).length >= 2);
  const choices = [
    twoOrMore.filter((s) => ofStreet(s).some((c) => c.refilledBeforeBell)),
    twoOrMore,
    streets,
  ].find((list) => list.length > 0);
  const marked = new Set<string>();
  if (!choices) return marked;

  const rng = townRng(runSeed, "candy-bowls:curse");
  const haunted = rng.pick(choices);
  const pool = [...ofStreet(haunted)];
  const take = (from: readonly Candidate[]) => {
    const picked = rng.pick(from);
    pool.splice(pool.indexOf(picked), 1);
    marked.add(picked.house.houseId);
  };
  const refilled = pool.filter((c) => c.refilledBeforeBell);
  if (refilled.length > 0) take(refilled);
  while (marked.size < HAUNTED_MARKS && pool.length > 0) take(pool);

  if (marked.size < 2) return marked;
  for (const street of streets) {
    if (street === haunted || rng.float() >= STRAY_MARK_CHANCE) continue;
    marked.add(rng.pick(ofStreet(street)).house.houseId);
  }
  return marked;
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
  const run = (house: House, marked: boolean) => {
    const deviceId = ids.get(house.houseId);
    if (!deviceId) throw new RangeError(`House ${house.houseId} has no bowl scale.`);
    const lit = porches.get(house.houseId) ?? [];
    const [on, off] = [lit[0]?.from, lit.at(-1)?.to];
    if (on === undefined || off === undefined) {
      throw new RangeError(`House ${house.houseId} gives candy but never lights its porch.`);
    }
    return runBowl(
      runSeed,
      house,
      deviceId,
      { on, off },
      visitsAt.get(house.houseId) ?? [],
      marked,
    );
  };
  const marked = markHouses(runSeed, giving, visitsAt, (house) => run(house, true));

  const bowls: CandyBowl[] = [];
  const handouts: CandyHandout[] = [];
  const unsorted: UnstampedReading[] = [];
  for (const house of giving) {
    const bowl = run(house, marked.has(house.houseId));
    bowls.push(bowl.bowl);
    handouts.push(...bowl.handouts);
    unsorted.push(...bowl.readings);
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
