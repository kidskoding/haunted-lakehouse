import "server-only";
import type { House } from "./houses";
import { townRng, weighted } from "./town";

export interface TrickOrTreater {
  readonly kidId: string;
  readonly name: string;
  readonly age: number;
  readonly costume: string;
  /** Kids out together share a group; most go in pairs or small packs, some alone. */
  readonly groupId: string;
  readonly homeHouseId: string;
}

// prettier-ignore
const FIRST_NAMES = [
  "Ada", "Ben", "Cleo", "Dev", "Esme", "Finn", "Gus", "Hana", "Iris", "Jude", "Kai", "Luz",
  "Milo", "Nia", "Otto", "Pia", "Quinn", "Rosa", "Sami", "Theo", "Uma", "Vik", "Wren", "Yara",
  "Zane", "Arlo", "Bea", "Cyrus", "Dot", "Eli", "Fern", "Ivo", "June", "Kofi", "Lev", "Mae",
] as const;

// A few favorites are much more common than the rest, so several kids share a costume.
const COSTUMES: readonly (readonly [string, number])[] = [
  ["ghost", 9],
  ["witch", 8],
  ["vampire", 6],
  ["skeleton", 6],
  ["pumpkin", 5],
  ["black cat", 5],
  ["werewolf", 4],
  ["mummy", 4],
  ["pirate", 3],
  ["astronaut", 3],
  ["dinosaur", 3],
  ["bat", 2],
  ["scarecrow", 2],
  ["zombie", 2],
  ["robot", 2],
  ["raven", 1],
  ["lighthouse keeper", 1],
  ["haunted lamp", 1],
];

// Trick-or-treating peaks around ages 6 to 9 and tails off into the early teens.
const AGES: readonly (readonly [number, number])[] = [
  [4, 3],
  [5, 5],
  [6, 8],
  [7, 9],
  [8, 9],
  [9, 8],
  [10, 6],
  [11, 4],
  [12, 3],
  [13, 2],
];

const GROUP_SIZES: readonly (readonly [number, number])[] = [
  [1, 2],
  [2, 4],
  [3, 3],
  [4, 2],
];

/**
 * Groups of kids, each from one of the town's houses. Names repeat across the town, so a
 * name alone never identifies a kid; the id does.
 */
export function generateTrickOrTreaters(
  runSeed: string,
  houses: readonly House[],
): TrickOrTreater[] {
  if (houses.length === 0) throw new RangeError("Kids need houses to live in.");
  const rng = townRng(runSeed, "trick-or-treaters");
  const groupCount = Math.round(houses.length * (0.5 + rng.float() * 0.3));

  const kids: TrickOrTreater[] = [];
  for (let g = 0; g < groupCount; g++) {
    const groupId = `G-${String(g + 1).padStart(3, "0")}`;
    const size = weighted(rng, GROUP_SIZES);
    // A group is usually siblings from one house, sometimes neighbors from a few.
    const home = rng.pick(houses);
    for (let k = 0; k < size; k++) {
      kids.push({
        kidId: `K-${String(kids.length + 1).padStart(4, "0")}`,
        name: rng.pick(FIRST_NAMES),
        age: weighted(rng, AGES),
        costume: weighted(rng, COSTUMES),
        groupId,
        homeHouseId: (rng.float() < 0.8 ? home : rng.pick(houses)).houseId,
      });
    }
  }
  return kids;
}
