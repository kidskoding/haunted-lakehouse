import { describe, expect, it } from "vitest";
import { CANDY_CATALOG, candyCatalogRows } from "./candy";
import { bowlReadingRows, bowlStockRows, generateCandyBowls } from "./candy-bowls";
import { generateDoorScans } from "./door-scans";
import { generateHouses } from "./houses";
import { NIGHT_SECONDS, secondsAt } from "./night-clock";
import { generateTrickOrTreaters } from "./trick-or-treaters";

const SEEDS = Array.from({ length: 20 }, (_, i) => `seed-${String(i)}`);
const ROW_BUDGET = 10_000;
// Each reading is off by at most 2 g, so a difference of two is off by at most 4 g.
const NOISE_TOLERANCE = 4;

const gramsOf = new Map(CANDY_CATALOG.map((c) => [c.candyType, c.gramsPerPiece]));

function night(seed: string) {
  const houses = generateHouses(seed);
  const kids = generateTrickOrTreaters(seed, houses);
  const scans = generateDoorScans(seed, houses, kids);
  return { houses, scans, ...generateCandyBowls(seed, houses, scans) };
}

function piecesByHouse(handouts: readonly { houseId: string; pieces: number }[]) {
  const totals = new Map<string, number>();
  for (const h of handouts) totals.set(h.houseId, (totals.get(h.houseId) ?? 0) + h.pieces);
  return totals;
}

const allNights = SEEDS.map(night);

describe("the candy catalog", () => {
  it("has distinct types and weights heavy enough to read through the scale's noise", () => {
    expect(new Set(CANDY_CATALOG.map((c) => c.candyType)).size).toBe(CANDY_CATALOG.length);
    expect(new Set(CANDY_CATALOG.map((c) => c.gramsPerPiece)).size).toBe(CANDY_CATALOG.length);
    for (const candy of CANDY_CATALOG) {
      expect(candy.gramsPerPiece).toBeGreaterThan(2 * NOISE_TOLERANCE);
      expect(Number.isInteger(candy.gramsPerPiece)).toBe(true);
    }
    expect(candyCatalogRows()[0]).toEqual({
      candy_type: "fun-size-bar",
      name: "Fun-size chocolate bar",
      grams_per_piece: 15,
      pieces_per_bag: 40,
    });
  });
});

describe("candy bowls", () => {
  it("are the same for the same seed", () => {
    expect(night("raven-pumpkin-13")).toEqual(night("raven-pumpkin-13"));
  });

  it("differ between seeds", () => {
    const a = night("raven-pumpkin-13");
    const b = night("raven-pumpkin-14");
    expect(a.bowls).not.toEqual(b.bowls);
    expect(a.handouts).not.toEqual(b.handouts);
    expect(a.readings).not.toEqual(b.readings);
  });

  it("have a house that gave out exactly 13 pieces in most nights", () => {
    const cursed = allNights.filter((n) => [...piecesByHouse(n.handouts).values()].includes(13));
    expect(cursed.length).toBeGreaterThanOrEqual(14);
  });

  it("show most refills as a jump in weight, though a rush at the door can hide one", () => {
    let jumps = 0;
    let refills = 0;
    for (const { bowls, readings } of allNights) {
      const byDevice = Map.groupBy(readings, (r) => r.deviceId);
      for (const bowl of bowls) {
        const own = byDevice.get(bowl.deviceId) ?? [];
        for (const refill of bowl.refills) {
          const before = own.filter((r) => r.nightSecond < refill.nightSecond).at(-1);
          const after = own.find((r) => r.nightSecond >= refill.nightSecond);
          if (!before || !after) throw new Error("A refill outside the bowl's readings.");
          refills++;
          if (after.weightG > before.weightG) jumps++;
        }
      }
    }
    expect(refills).toBeGreaterThan(100);
    expect(jumps / refills).toBeGreaterThan(0.9);
  });

  it("stock a variety of candy across the town", () => {
    const types = new Set(allNights.flatMap((n) => n.bowls.map((b) => b.candyType)));
    expect(types.size).toBeGreaterThanOrEqual(6);
  });

  it("become feed rows with only the scale's view of time", () => {
    const { readings, bowls } = night("raven-pumpkin-13");
    const [reading] = readings;
    const [bowl] = bowls;
    if (!reading || !bowl) throw new Error("The night has no bowls.");
    expect(bowlReadingRows([reading])).toEqual([
      {
        device_id: reading.deviceId,
        seq: reading.seq,
        house_id: reading.houseId,
        weight_g: reading.weightG,
        read_at_local: reading.readAtLocal,
        utc_offset: reading.utcOffset,
      },
    ]);
    expect(bowlStockRows([bowl])).toEqual([
      { device_id: bowl.deviceId, house_id: bowl.houseId, candy_type: bowl.candyType },
    ]);
  });

  describe.each(SEEDS.map((seed, i) => [seed, allNights[i]] as const))("seed %s", (_, data) => {
    if (!data) throw new Error("missing night");
    const { houses, scans, bowls, handouts, readings } = data;
    const byDevice = Map.groupBy(readings, (r) => r.deviceId);

    it("puts one scale with a unique id on every candy-giving house", () => {
      const giving = houses.filter((h) => h.givesCandy).map((h) => h.houseId);
      expect(bowls.map((b) => b.houseId)).toEqual(giving);
      expect(new Set(bowls.map((b) => b.deviceId)).size).toBe(bowls.length);
    });

    it("records one handout of 1 to 3 pieces, mostly 1 or 2, for every door scan", () => {
      expect(handouts).toHaveLength(scans.length);
      const scanKeys = new Set(scans.map((s) => `${s.deviceId}#${String(s.seq)}`));
      for (const h of handouts) {
        expect(scanKeys.has(`${h.scanDeviceId}#${String(h.scanSeq)}`)).toBe(true);
        expect(h.pieces).toBeGreaterThanOrEqual(1);
        expect(h.pieces).toBeLessThanOrEqual(3);
      }
      const threes = handouts.filter((h) => h.pieces === 3).length;
      expect(threes / handouts.length).toBeLessThan(0.25);
    });

    it("gives each house's handouts per kid in its own candy, summing to its door scans", () => {
      const candyOf = new Map(bowls.map((b) => [b.houseId, b.candyType]));
      const scansAt = Map.groupBy(scans, (s) => s.houseId);
      const totals = piecesByHouse(handouts);
      for (const bowl of bowls) {
        const own = handouts.filter((h) => h.houseId === bowl.houseId);
        expect(own.map((h) => h.kidId)).toEqual(
          (scansAt.get(bowl.houseId) ?? []).map((s) => s.kidId),
        );
        expect(totals.get(bowl.houseId) ?? 0).toBe(own.reduce((sum, h) => sum + h.pieces, 0));
        for (const h of own) expect(h.candyType).toBe(candyOf.get(h.houseId));
      }
    });

    it("stays within the night, in true-time order, under the row budget", () => {
      expect(readings.length).toBeLessThan(ROW_BUDGET);
      for (const [i, r] of readings.entries()) {
        const prev = readings[i - 1];
        expect(r.nightSecond).toBeGreaterThanOrEqual(0);
        expect(r.nightSecond).toBeLessThan(NIGHT_SECONDS);
        expect(secondsAt(r.readAtLocal)).toContain(r.nightSecond);
        if (prev) {
          const ordered =
            prev.nightSecond < r.nightSecond ||
            (prev.nightSecond === r.nightSecond && prev.deviceId < r.deviceId);
          expect(ordered).toBe(true);
        }
      }
    });

    it("numbers each scale's readings 1..n, from bowl out to bowl in", () => {
      for (const bowl of bowls) {
        const own = byDevice.get(bowl.deviceId) ?? [];
        expect(own.map((r) => r.seq)).toEqual(own.map((_, i) => i + 1));
        expect(own[0]?.nightSecond).toBe(bowl.setOutAt);
        expect(own.at(-1)?.nightSecond).toBe(bowl.takenInAt);
        for (let i = 1; i < own.length; i++) {
          const gap = (own[i]?.nightSecond ?? 0) - (own[i - 1]?.nightSecond ?? 0);
          expect(gap).toBeGreaterThan(0);
          // A heartbeat after 15 quiet minutes, unless a reading is due within the minute.
          expect(gap).toBeLessThanOrEqual(16 * 60);
        }
      }
    });

    it("never reads a negative weight, and changes by pieces times grams within the noise", () => {
      for (const bowl of bowls) {
        const grams = gramsOf.get(bowl.candyType) ?? 0;
        const own = byDevice.get(bowl.deviceId) ?? [];
        const taken = handouts.filter((h) => h.houseId === bowl.houseId);
        const first = own[0];
        if (!first) throw new Error(`No readings for ${bowl.deviceId}`);
        const takenBy = (t: number) =>
          taken.filter((h) => h.nightSecond <= t).reduce((sum, h) => sum + h.pieces, 0);
        const refilledBy = (t: number) =>
          bowl.refills.filter((r) => r.nightSecond <= t).reduce((sum, r) => sum + r.pieces, 0);
        expect(Math.abs(first.weightG - bowl.initialPieces * grams)).toBeLessThanOrEqual(
          NOISE_TOLERANCE,
        );
        for (let i = 1; i < own.length; i++) {
          const [prev, next] = [own[i - 1], own[i]];
          if (!prev || !next) throw new Error("missing reading");
          expect(next.weightG).toBeGreaterThanOrEqual(0);
          const net =
            refilledBy(next.nightSecond) -
            refilledBy(prev.nightSecond) -
            (takenBy(next.nightSecond) - takenBy(prev.nightSecond));
          expect(Math.abs(next.weightG - prev.weightG - net * grams)).toBeLessThanOrEqual(
            NOISE_TOLERANCE,
          );
          // Under half a piece of noise, so rounding recovers the exact change in pieces.
          expect(Math.round((next.weightG - prev.weightG) / grams) === net).toBe(true);
        }
        const left = bowl.initialPieces + refilledBy(NIGHT_SECONDS) - takenBy(NIGHT_SECONDS);
        expect(left).toBeGreaterThanOrEqual(0);
      }
    });

    it("refills a whole bag at a time", () => {
      for (const bowl of bowls) {
        const candy = CANDY_CATALOG.find((c) => c.candyType === bowl.candyType);
        if (!candy) throw new Error(`Unknown candy ${bowl.candyType}`);
        expect(bowl.initialPieces % candy.piecesPerBag).toBe(0);
        for (const refill of bowl.refills) expect(refill.pieces).toBe(candy.piecesPerBag);
      }
    });

    it("needs refills at busy doors", () => {
      expect(bowls.some((b) => b.refills.length > 0)).toBe(true);
    });
  });
});
