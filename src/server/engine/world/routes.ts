import "server-only";
import type { Rng } from "../random";
import type { House } from "./houses";
import { FALL_BACK_SECOND, NIGHT_SECONDS } from "./night-clock";
import { townRng, weighted } from "./town";
import type { TrickOrTreater } from "./trick-or-treaters";

/** One group's night: which candy-giving doors it knocks on, in order, and when. */
export interface Route {
  readonly groupId: string;
  /** Members in kid-id order. */
  readonly kidIds: readonly string[];
  readonly stops: readonly Stop[];
}

export interface Stop {
  readonly houseId: string;
  /** Night second the group reaches the door. */
  readonly arrival: number;
}

const MINUTE = 60;
const HOUR = 3600;

/*
 * Start times, as quarter-hour slots after 18:00. Little kids go out at dusk and are home
 * early; older ones go later. Together they put the town's busiest hour at 19:00 to 20:00.
 */
const STARTS = {
  little: [
    [0, 1],
    [15, 3],
    [30, 5],
    [45, 6],
    [60, 5],
    [75, 3],
    [90, 1],
  ],
  middle: [
    [30, 1],
    [45, 3],
    [60, 5],
    [75, 6],
    [90, 5],
    [105, 3],
    [120, 2],
    [150, 1],
  ],
  older: [
    [60, 2],
    [75, 3],
    [90, 4],
    [105, 4],
    [120, 3],
    [150, 3],
    [180, 2],
    [210, 1],
    [240, 1],
  ],
} as const satisfies Record<string, readonly (readonly [number, number])[]>;

type Pace = keyof typeof STARTS;

/** Streets walked, as [min, max) for rng.int. */
const STREETS_WALKED: Record<Pace, readonly [number, number]> = {
  little: [1, 3],
  middle: [2, 4],
  older: [2, 5],
};

/** A step on the route before timing: a door, and whether the group just changed streets. */
interface Step {
  readonly house: House;
  readonly newStreet: boolean;
}

function paceOf(youngest: number): Pace {
  if (youngest <= 6) return "little";
  return youngest <= 10 ? "middle" : "older";
}

function shuffled<T>(rng: Rng, items: readonly T[]): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = rng.int(0, i + 1);
    [out[i], out[j]] = [out[j] as T, out[i] as T];
  }
  return out;
}

/**
 * The doors, in walking order: from the home street outward, up one side of each street in
 * house-number order and usually back down the other, skipping some doors along the way.
 */
function plan(
  rng: Rng,
  homeStreet: string,
  bySide: ReadonlyMap<string, readonly [House[], House[]]>,
  streetCount: number,
  visitChance: number,
): Step[] {
  const others = [...bySide.keys()].filter((s) => s !== homeStreet).sort();
  const streets = [homeStreet, ...shuffled(rng, others)].slice(0, streetCount);
  const steps: Step[] = [];
  for (const street of streets) {
    const sides = bySide.get(street);
    if (!sides) continue;
    const [first, second] = rng.float() < 0.5 ? sides : [sides[1], sides[0]];
    const walk = rng.float() < 0.7 ? [...first, ...[...second].reverse()] : first;
    let newStreet = true;
    for (const house of walk) {
      if (rng.float() >= visitChance) continue;
      steps.push({ house, newStreet });
      newStreet = false;
    }
  }
  return steps;
}

/** Seconds between doors: a stroll to the next one, or a longer walk to a new street. */
function gap(rng: Rng, newStreet: boolean, owl: boolean): number {
  if (owl) return newStreet ? rng.int(15 * MINUTE, 30 * MINUTE) : rng.int(2 * MINUTE, 6 * MINUTE);
  return newStreet ? rng.int(5 * MINUTE, 15 * MINUTE) : rng.int(MINUTE, 4 * MINUTE);
}

/**
 * Every group's route. A few of the oldest groups are night owls: they head out late and
 * dawdle until nearly 3am, so the town sees doors knocked through both 1am hours.
 */
export function planRoutes(
  runSeed: string,
  houses: readonly House[],
  kids: readonly TrickOrTreater[],
): Route[] {
  const homes = new Map(houses.map((h) => [h.houseId, h]));
  const bySide = new Map<string, [House[], House[]]>();
  for (const house of [...houses].sort((a, b) => a.number - b.number)) {
    if (!house.givesCandy) continue;
    const sides = bySide.get(house.street) ?? [[], []];
    (house.number % 2 === 1 ? sides[0] : sides[1]).push(house);
    bySide.set(house.street, sides);
  }

  const groups = [...Map.groupBy(kids, (k) => k.groupId)].sort(([a], [b]) => (a < b ? -1 : 1));
  const youngest = (members: readonly TrickOrTreater[]) => Math.min(...members.map((k) => k.age));

  const owlRng = townRng(runSeed, "door-scans:owls");
  const owlCount = owlRng.int(2, 4);
  const owls = new Set(
    groups
      .map(([groupId, members]) => ({ groupId, age: youngest(members), roll: owlRng.float() }))
      .sort((a, b) => b.age - a.age || a.roll - b.roll)
      .slice(0, owlCount)
      .map((g) => g.groupId),
  );

  return groups.map(([groupId, members]) => {
    const rng = townRng(runSeed, `door-scans:${groupId}`);
    const kidIds = members.map((k) => k.kidId).sort();
    const homeStreet = homes.get(members[0]?.homeHouseId ?? "")?.street;
    if (!homeStreet) throw new RangeError(`Group ${groupId} has no home street.`);
    const owl = owls.has(groupId);
    const pace = paceOf(youngest(members));

    const steps = owl
      ? plan(rng, homeStreet, bySide, bySide.size, 0.8)
      : plan(rng, homeStreet, bySide, rng.int(...STREETS_WALKED[pace]), 0.55 + rng.float() * 0.3);

    const start = owl
      ? rng.int(4 * HOUR, 5 * HOUR)
      : weighted(rng, STARTS[pace]) * MINUTE + rng.int(0, 15 * MINUTE);
    const gaps = steps.map((step, i) => (i === 0 ? 0 : gap(rng, step.newStreet, owl)));

    // Night owls dawdle until they head home between 02:20 and 02:55 CST. Their gaps only
    // ever stretch to fill that window, never squeeze, so they cut doors that don't fit.
    const end = FALL_BACK_SECOND + rng.int(80 * MINUTE, 115 * MINUTE);
    let total = gaps.reduce((a, b) => a + b, 0);
    while (owl && total > end - start) total -= gaps.pop() ?? 0;
    const scale = owl && total > 0 ? (end - start) / total : 1;

    let arrival = start;
    const stops: Stop[] = [];
    gaps.forEach((walk, i) => {
      const step = steps[i];
      arrival += Math.round(walk * scale);
      if (!step) return;
      if (arrival < NIGHT_SECONDS - MINUTE) stops.push({ houseId: step.house.houseId, arrival });
    });
    return { groupId, kidIds, stops };
  });
}
