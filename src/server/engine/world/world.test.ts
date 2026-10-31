import { describe, expect, it } from "vitest";
import { generateHouses, houseRows } from "./houses";
import { STREETS } from "./town";
import { generateTrickOrTreaters } from "./trick-or-treaters";

const SEEDS = Array.from({ length: 20 }, (_, i) => `seed-${String(i)}`);

function town(seed: string) {
  const houses = generateHouses(seed);
  return { houses, kids: generateTrickOrTreaters(seed, houses) };
}

function mean(values: readonly number[]): number {
  return values.reduce((a, b) => a + b, 0) / values.length;
}

describe("the Hollow Creek world", () => {
  it("is the same for the same seed", () => {
    expect(town("raven-pumpkin-13")).toEqual(town("raven-pumpkin-13"));
  });

  it("differs between seeds", () => {
    const a = town("raven-pumpkin-13");
    const b = town("raven-pumpkin-14");
    expect(a.houses).not.toEqual(b.houses);
    expect(a.kids).not.toEqual(b.kids);
  });

  it("lists every house in the town directory, dark or not", () => {
    const { houses } = town("raven-pumpkin-13");
    const rows = houseRows(houses);
    expect(rows).toHaveLength(houses.length);
    const [house] = houses;
    if (!house) throw new Error("The town has no houses.");
    expect(rows[0]).toEqual({
      house_id: house.houseId,
      street: house.street,
      house_number: house.number,
      household: house.household,
    });
  });

  describe.each(SEEDS)("seed %s", (seed) => {
    const { houses, kids } = town(seed);

    it("has a believable number of houses on six to eight streets", () => {
      const streets = new Set(houses.map((h) => h.street));
      expect(streets.size).toBeGreaterThanOrEqual(6);
      expect(streets.size).toBeLessThanOrEqual(8);
      expect(houses.length).toBeGreaterThanOrEqual(6 * 8);
      expect(houses.length).toBeLessThanOrEqual(8 * 16);
      for (const street of streets) expect(STREETS).toContain(street);
    });

    it("gives every house a unique id and a unique number on its street", () => {
      expect(new Set(houses.map((h) => h.houseId)).size).toBe(houses.length);
      expect(new Set(houses.map((h) => `${h.street}#${String(h.number)}`)).size).toBe(
        houses.length,
      );
    });

    it("puts odd and even numbers on both sides of every street", () => {
      for (const street of new Set(houses.map((h) => h.street))) {
        const numbers = houses.filter((h) => h.street === street).map((h) => h.number % 2);
        expect(numbers).toContain(0);
        expect(numbers).toContain(1);
      }
    });

    it("leaves some houses dark, but most give candy", () => {
      const giving = houses.filter((h) => h.givesCandy).length / houses.length;
      expect(giving).toBeGreaterThan(0.55);
      expect(giving).toBeLessThan(0.95);
    });

    it("sends out kids of trick-or-treating age from real houses, in small groups", () => {
      const houseIds = new Set(houses.map((h) => h.houseId));
      expect(new Set(kids.map((k) => k.kidId)).size).toBe(kids.length);
      for (const kid of kids) {
        expect(kid.age).toBeGreaterThanOrEqual(4);
        expect(kid.age).toBeLessThanOrEqual(13);
        expect(houseIds.has(kid.homeHouseId)).toBe(true);
      }
      const groupSizes = Map.groupBy(kids, (k) => k.groupId);
      for (const members of groupSizes.values()) {
        expect(members.length).toBeGreaterThanOrEqual(1);
        expect(members.length).toBeLessThanOrEqual(4);
      }
    });

    it("has ages centered on the trick-or-treating peak", () => {
      const average = mean(kids.map((k) => k.age));
      expect(average).toBeGreaterThan(7);
      expect(average).toBeLessThan(9.5);
    });

    it("has kids who share a costume and kids who share a name", () => {
      const byCostume = Map.groupBy(kids, (k) => k.costume);
      expect(Math.max(...[...byCostume.values()].map((g) => g.length))).toBeGreaterThan(5);
      const byName = Map.groupBy(kids, (k) => k.name);
      expect([...byName.values()].some((g) => g.length > 1)).toBe(true);
    });
  });
});
