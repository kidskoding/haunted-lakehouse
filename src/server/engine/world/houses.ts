import "server-only";
import { STREETS, townRng, weighted, type Street } from "./town";

export interface House {
  readonly houseId: string;
  readonly street: Street;
  readonly number: number;
  readonly household: string;
  /** Whether anyone answers the door tonight. Dark houses still sit on the route. */
  readonly givesCandy: boolean;
}

// prettier-ignore
const SURNAMES = [
  "Abernathy", "Blackwood", "Crane", "Dunmore", "Eldridge", "Fairweather", "Graves", "Hale",
  "Ingram", "Jessup", "Kettering", "Larkin", "Morrow", "Nightingale", "Okafor", "Pruitt",
  "Quill", "Ravenscroft", "Sallow", "Thorne", "Underhill", "Vance", "Whitlock", "Yarrow",
  "Alvarez", "Nakamura", "Osei", "Petrov", "Haddad", "Lindqvist", "Moreau", "Brennan",
] as const;

/**
 * Houses line six to eight of the town's streets, odd numbers on one side and even on the
 * other, like a real street. About three in four give out candy, the rest stay dark.
 */
export function generateHouses(runSeed: string): House[] {
  const rng = townRng(runSeed, "houses");
  const streetCount = rng.int(6, 9);
  const streets = [...STREETS];
  // A partial Fisher-Yates shuffle picks which streets this run's town has.
  for (let i = 0; i < streetCount; i++) {
    const j = rng.int(i, streets.length);
    [streets[i], streets[j]] = [streets[j] as Street, streets[i] as Street];
  }

  const houses: House[] = [];
  for (const street of streets.slice(0, streetCount)) {
    const perSide = rng.int(4, 9);
    for (const side of [1, 2]) {
      let number = side + 2 * rng.int(0, 5);
      for (let i = 0; i < perSide; i++) {
        houses.push({
          houseId: `H-${String(houses.length + 1).padStart(3, "0")}`,
          street,
          number,
          household: rng.pick(SURNAMES),
          givesCandy: weighted(rng, [
            [true, 3],
            [false, 1],
          ]),
        });
        // Usually the next lot, sometimes a gap where a lot is empty.
        number +=
          2 *
          weighted(rng, [
            [1, 6],
            [2, 1],
          ]);
      }
    }
  }
  return houses;
}
