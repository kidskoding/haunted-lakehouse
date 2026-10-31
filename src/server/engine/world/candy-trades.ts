import "server-only";
import type { Row } from "../puzzle";
import type { Rng } from "../random";
import type { CandyHandout } from "./candy-bowls";
import { openLedger, type HoldingVersion, type LedgerChange } from "./candy-ledger";
import { byText } from "./device-ids";
import { clockAt, FALL_BACK_SECOND, type UtcOffset } from "./night-clock";
import { townRng, weighted } from "./town";
import type { TrickOrTreater } from "./trick-or-treaters";

/**
 * Where a trade happened: walking between doors with the kid's own group, at the Co-op's
 * table in the evening, or at the Co-op's swap meet in the small hours.
 */
export type TradeVenue = "walk" | "co-op-table" | "swap-meet";

/** Candy passing one way: a swap has two legs, a gift has one. */
export interface TradeLeg {
  readonly giverKidId: string;
  readonly receiverKidId: string;
  readonly candyType: string;
  readonly pieces: number;
}

export interface CandyTrade {
  /** TR-0001, TR-0002, ... in the order the trades happened. */
  readonly tradeId: string;
  readonly venue: TradeVenue;
  /** True time, in seconds since 18:00 CDT. Never shipped. */
  readonly nightSecond: number;
  readonly tradedAtLocal: string;
  readonly utcOffset: UtcOffset;
  readonly legs: readonly TradeLeg[];
}

export interface CandyTradeFeed {
  readonly trades: readonly CandyTrade[];
  /** Every collection and trade as balance changes, in lsn order, which is true-time order. */
  readonly ledger: readonly LedgerChange[];
  /** The true balance history, by kid, then candy type, then time. */
  readonly history: readonly HoldingVersion[];
}

const MINUTE = 60;
const HOUR = 3600;

/** A table where kids who have finished their rounds sit down and trade. */
interface Venue {
  readonly name: Exclude<TradeVenue, "walk">;
  readonly opens: number;
  readonly closes: number;
  readonly minAge: number;
  readonly chance: number;
  /**
   * How long kids dawdle after they could first be there (rounds done and table open), as an
   * exclusive bound in seconds, so arrivals spread over the session instead of piling up at
   * opening time.
   */
  readonly dawdle: number;
  readonly stay: readonly [number, number];
}

/*
 * The Co-op's evening table runs 19:30 to 00:30, for anyone done with their rounds. Its swap
 * meet is advertised as "one to two", and on fall-back night one to two lasts two hours:
 * 01:00 CDT to 02:00 CST. Only the older kids are still up for it. That keeps trades in both
 * 1am hours, so a ledger read by wall clock alone interleaves two different hours.
 */
const VENUES: readonly Venue[] = [
  {
    name: "co-op-table",
    opens: 1.5 * HOUR,
    closes: 6.5 * HOUR,
    minAge: 0,
    chance: 0.3,
    dawdle: 30 * MINUTE,
    stay: [10 * MINUTE, 45 * MINUTE],
  },
  {
    name: "swap-meet",
    opens: 7 * HOUR,
    closes: FALL_BACK_SECOND + HOUR,
    minAge: 10,
    chance: 0.5,
    dawdle: 100 * MINUTE,
    stay: [15 * MINUTE, 60 * MINUTE],
  },
];

// The walk from a kid's last door to the Co-op, as [min, max) for rng.int.
const WALK_OVER: readonly [number, number] = [3 * MINUTE, 20 * MINUTE];
// A visitor arriving this close to closing time doesn't bother sitting down.
const LAST_ARRIVAL = 10 * MINUTE;

/** How many trades a kid at a table strikes up. */
const OVERTURES: readonly (readonly [number, number])[] = [
  [0, 3],
  [1, 4],
  [2, 2],
  [3, 1],
];

// Some groups haggle between doors; most just walk.
const WALK_TRADE_CHANCE = 0.35;
const WALK_TRADES: readonly (readonly [number, number])[] = [
  [1, 3],
  [2, 1],
];
// Long enough between doors to stop and swap.
const MIN_WALK_GAP = MINUTE;

const GIFT_CHANCE = 0.15;
const MAX_PIECES_PER_LEG = 4;
// A clash with another of the kid's changes moves a trade a few seconds, or calls it off.
const MAX_NUDGE = 5;

interface Visit {
  readonly kidId: string;
  readonly arrive: number;
  readonly leave: number;
}

/** A trade decided on before anyone knows what's in whose bag. */
interface Plan {
  readonly nightSecond: number;
  readonly venue: TradeVenue;
  readonly kids: readonly [string, string];
}

function visitsTo(
  rng: Rng,
  venue: Venue,
  kids: readonly TrickOrTreater[],
  lastScans: ReadonlyMap<string, number>,
): Visit[] {
  const visits: Visit[] = [];
  for (const kid of kids) {
    const lastScan = lastScans.get(kid.kidId);
    // Only kids who were out tonight, and only once their rounds are done.
    if (lastScan === undefined || kid.age < venue.minAge || rng.float() >= venue.chance) continue;
    const ready = Math.max(venue.opens, lastScan + rng.int(...WALK_OVER));
    const arrive = ready + rng.int(0, venue.dawdle);
    if (arrive >= venue.closes - LAST_ARRIVAL) continue;
    const leave = Math.min(venue.closes, arrive + rng.int(...venue.stay));
    visits.push({ kidId: kid.kidId, arrive, leave });
  }
  return visits;
}

/** Trades at a table, each between a kid and someone else sitting there at the time. */
function tablePlans(rng: Rng, venue: Venue, visits: readonly Visit[]): Plan[] {
  const plans: Plan[] = [];
  for (const visit of visits) {
    for (let n = weighted(rng, OVERTURES); n > 0; n--) {
      const at = rng.int(visit.arrive, visit.leave);
      const others = visits.filter(
        (v) => v.kidId !== visit.kidId && v.arrive <= at && at < v.leave,
      );
      if (others.length === 0) continue;
      plans.push({
        nightSecond: at,
        venue: venue.name,
        kids: [visit.kidId, rng.pick(others).kidId],
      });
    }
  }
  return plans;
}

/**
 * Trades between two kids of one group, somewhere between two doors once both have candy.
 * The group walks together, so either kid's scans mark where they both were.
 */
function walkPlans(
  rng: Rng,
  kids: readonly TrickOrTreater[],
  scanTimes: ReadonlyMap<string, readonly number[]>,
): Plan[] {
  const plans: Plan[] = [];
  for (const members of Map.groupBy(kids, (k) => k.groupId).values()) {
    const out = members.filter((k) => scanTimes.has(k.kidId)).map((k) => k.kidId);
    if (out.length < 2 || rng.float() >= WALK_TRADE_CHANCE) continue;
    for (let n = weighted(rng, WALK_TRADES); n > 0; n--) {
      const a = rng.pick(out);
      const b = rng.pick(out.filter((id) => id !== a));
      const timesA = scanTimes.get(a) ?? [];
      const timesB = scanTimes.get(b) ?? [];
      const bothHaveCandy = Math.max(timesA[0] ?? Infinity, timesB[0] ?? Infinity);
      const doors = [...new Set([...timesA, ...timesB])].sort((x, y) => x - y);
      const gaps = doors.flatMap((from, i) => {
        const to = doors[i + 1];
        if (to === undefined || from < bothHaveCandy || to - from < MIN_WALK_GAP) return [];
        return [[from, to] as const];
      });
      if (gaps.length === 0) continue;
      const [from, to] = rng.pick(gaps);
      plans.push({ nightSecond: rng.int(from + 1, to), venue: "walk", kids: [a, b] });
    }
  }
  return plans;
}

function byPlan(a: Plan, b: Plan): number {
  return (
    a.nightSecond - b.nightSecond || byText(a.kids[0], b.kids[0]) || byText(a.kids[1], b.kids[1])
  );
}

/**
 * Keeps every kid to one change of each balance per second, so the ledger has no ties a
 * reader would need the lsn to break within one kid's candy.
 */
function scheduled(plans: readonly Plan[], handouts: readonly CandyHandout[]): Plan[] {
  const busy = new Map<string, Set<number>>();
  const busyAt = (kidId: string) => {
    const seconds = busy.get(kidId) ?? new Set<number>();
    busy.set(kidId, seconds);
    return seconds;
  };
  for (const h of handouts) busyAt(h.kidId).add(h.nightSecond);

  const kept: Plan[] = [];
  for (const plan of [...plans].sort(byPlan)) {
    const a = busyAt(plan.kids[0]);
    const b = busyAt(plan.kids[1]);
    let at = plan.nightSecond;
    while ((a.has(at) || b.has(at)) && at - plan.nightSecond < MAX_NUDGE) at++;
    if (a.has(at) || b.has(at)) continue;
    a.add(at);
    b.add(at);
    kept.push({ ...plan, nightSecond: at });
  }
  return kept.sort(byPlan);
}

type Holdings = readonly (readonly [string, number])[];

function leg(rng: Rng, giver: string, receiver: string, options: Holdings): TradeLeg {
  const [candyType, held] = rng.pick(options);
  const pieces = rng.int(1, Math.min(held, MAX_PIECES_PER_LEG) + 1);
  return { giverKidId: giver, receiverKidId: receiver, candyType, pieces };
}

/**
 * What changes hands, decided from what the two kids hold right then: usually a swap of two
 * different candies, sometimes a gift. Nobody gives what they don't have.
 */
function terms(rng: Rng, [a, b]: readonly [string, string], heldA: Holdings, heldB: Holdings) {
  if (heldA.length === 0 && heldB.length === 0) return [];
  const [giver, receiver, giverHolds, receiverHolds] =
    heldA.length > 0 ? [a, b, heldA, heldB] : [b, a, heldB, heldA];
  const first = leg(rng, giver, receiver, giverHolds);
  const counter = receiverHolds.filter(([type]) => type !== first.candyType);
  if (counter.length === 0 || rng.float() < GIFT_CHANCE) return [first];
  return [first, leg(rng, receiver, giver, counter)];
}

type Event =
  | { readonly kind: "handout"; readonly nightSecond: number; readonly handout: CandyHandout }
  | { readonly kind: "trade"; readonly nightSecond: number; readonly plan: Plan };

/**
 * The night's candy trades and the Co-op ledger: every piece collected at a door and every
 * piece traded, as balance changes in true-time order. Clean and on time: the batch
 * scheduler reorders and resends.
 */
export function generateCandyTrades(
  runSeed: string,
  kids: readonly TrickOrTreater[],
  handouts: readonly CandyHandout[],
): CandyTradeFeed {
  const scanTimes = new Map(
    [...Map.groupBy(handouts, (h) => h.kidId)].map(([kidId, own]) => [
      kidId,
      own.map((h) => h.nightSecond).sort((x, y) => x - y),
    ]),
  );
  const lastScans = new Map([...scanTimes].map(([kidId, times]) => [kidId, times.at(-1) ?? 0]));

  const plans = walkPlans(townRng(runSeed, "candy-trades:walks"), kids, scanTimes);
  for (const venue of VENUES) {
    const rng = townRng(runSeed, `candy-trades:${venue.name}`);
    plans.push(...tablePlans(rng, venue, visitsTo(rng, venue, kids, lastScans)));
  }

  // Handouts sort first within a second; Array#sort is stable, so each side keeps its order.
  const events: Event[] = [
    ...handouts.map((handout) => ({
      kind: "handout" as const,
      nightSecond: handout.nightSecond,
      handout,
    })),
    ...scheduled(plans, handouts).map((plan) => ({
      kind: "trade" as const,
      nightSecond: plan.nightSecond,
      plan,
    })),
  ].sort(
    (x, y) =>
      x.nightSecond - y.nightSecond || (x.kind === y.kind ? 0 : x.kind === "handout" ? -1 : 1),
  );

  const rng = townRng(runSeed, "candy-trades:terms");
  const book = openLedger();
  const trades: CandyTrade[] = [];
  for (const event of events) {
    if (event.kind === "handout") {
      const { kidId, candyType, pieces, nightSecond } = event.handout;
      book.apply(kidId, candyType, pieces, nightSecond, null);
      continue;
    }
    const { plan } = event;
    const [a, b] = plan.kids;
    const legs = terms(rng, plan.kids, book.holdingsOf(a), book.holdingsOf(b));
    if (legs.length === 0) continue;
    const tradeId = `TR-${String(trades.length + 1).padStart(4, "0")}`;
    for (const l of legs) {
      book.apply(l.giverKidId, l.candyType, -l.pieces, plan.nightSecond, tradeId);
      book.apply(l.receiverKidId, l.candyType, l.pieces, plan.nightSecond, tradeId);
    }
    const clock = clockAt(plan.nightSecond);
    trades.push({
      tradeId,
      venue: plan.venue,
      nightSecond: plan.nightSecond,
      tradedAtLocal: clock.local,
      utcOffset: clock.utcOffset,
      legs,
    });
  }
  return { trades, ledger: book.changes(), history: book.history() };
}

/** The `candy_trades` feed: one row per leg, as the kids reported their trades to the Co-op. */
export function candyTradeRows(trades: readonly CandyTrade[]): Row[] {
  return trades.flatMap((t) =>
    t.legs.map((l) => ({
      trade_id: t.tradeId,
      giver_kid_id: l.giverKidId,
      receiver_kid_id: l.receiverKidId,
      candy_type: l.candyType,
      pieces: l.pieces,
      traded_at_local: t.tradedAtLocal,
      utc_offset: t.utcOffset,
    })),
  );
}
