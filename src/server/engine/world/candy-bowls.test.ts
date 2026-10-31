import { describe, expect, it } from "vitest";
import { CANDY_CATALOG, candyCatalogRows } from "./candy";
import {
  bowlReadingRows,
  bowlStockRows,
  CURSE_BELL,
  generateCandyBowls,
  piecesRecordedBefore,
} from "./candy-bowls";
import { generateDoorScans } from "./door-scans";
import { generateHouses } from "./houses";
import { NIGHT_SECONDS, secondsAt } from "./night-clock";
import { generatePorchLights } from "./porch-lights";
import { generateTrickOrTreaters } from "./trick-or-treaters";

const SEEDS = Array.from({ length: 20 }, (_, i) => `seed-${String(i)}`);
// The invariants below are cheap to check, so they get a wider sweep than the per-seed suite.
const MANY_SEEDS = Array.from({ length: 150 }, (_, i) => `seed-${String(i)}`);
const ROW_BUDGET = 10_000;
// Each reading is off by at most 2 g, so a difference of two is off by at most 4 g.
const NOISE_TOLERANCE = 4;

const gramsOf = new Map(CANDY_CATALOG.map((c) => [c.candyType, c.gramsPerPiece]));

function night(seed: string) {
  const houses = generateHouses(seed);
  const kids = generateTrickOrTreaters(seed, houses);
  const scans = generateDoorScans(seed, houses, kids);
  const { lights } = generatePorchLights(seed, houses, scans);
  return { houses, scans, ...generateCandyBowls(seed, houses, scans, lights) };
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

  it("have houses whose scales recorded exactly 13 pieces before the bell, two on one street", () => {
    for (const { houses, bowls, handouts, readings } of allNights) {
      const streetOf = new Map(houses.map((h) => [h.houseId, h.street]));
      const cursed = bowls.filter(
        (b) =>
          piecesRecordedBefore(
            handouts.filter((h) => h.houseId === b.houseId),
            readings.filter((r) => r.deviceId === b.deviceId),
            CURSE_BELL,
          ) === 13,
      );
      const perStreet = Map.groupBy(cursed, (b) => streetOf.get(b.houseId));
      expect(Math.max(...[...perStreet.values()].map((on) => on.length))).toBeGreaterThanOrEqual(2);
      // One of them was topped up before the bell, so its weight went up as well as down.
      const refilledEarly = cursed.some((b) => {
        const before = readings.filter(
          (r) => r.deviceId === b.deviceId && r.nightSecond < CURSE_BELL,
        );
        const last = before.at(-1)?.nightSecond ?? -1;
        return b.refills.some((r) => r.nightSecond <= last);
      });
      expect(refilledEarly).toBe(true);
    }
  });

  it("count a handout once a reading before the cutoff has weighed it", () => {
    const handouts = [
      { nightSecond: 10, pieces: 2 },
      { nightSecond: 50, pieces: 3 },
      { nightSecond: 90, pieces: 1 },
    ].map((h) => ({
      ...h,
      houseId: "H",
      kidId: "K",
      scanDeviceId: "S",
      scanSeq: 1,
      candyType: "c",
    }));
    const readings = [
      { nightSecond: 0 },
      { nightSecond: 30 },
      { nightSecond: 70 },
      { nightSecond: 120 },
    ];
    expect(piecesRecordedBefore(handouts, readings, 100)).toBe(5);
    expect(piecesRecordedBefore(handouts, readings, 70)).toBe(2);
    expect(piecesRecordedBefore(handouts, readings, 0)).toBe(0);
  });

  it("show every refill as a jump in weight", () => {
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
    expect(jumps).toBe(refills);
  });

  describe("between neighbouring readings of one scale, across many seeds", () => {
    const intervals = MANY_SEEDS.flatMap((seed) => {
      const { bowls, handouts, readings } = night(seed);
      const byDevice = Map.groupBy(readings, (r) => r.deviceId);
      const byHouse = Map.groupBy(handouts, (h) => h.houseId);
      return bowls.flatMap((bowl) => {
        const candy = CANDY_CATALOG.find((c) => c.candyType === bowl.candyType);
        if (!candy) throw new Error(`Unknown candy ${bowl.candyType}`);
        const own = byDevice.get(bowl.deviceId) ?? [];
        const taken = byHouse.get(bowl.houseId) ?? [];
        return own.slice(1).map((next, i) => {
          const prev = own[i];
          if (!prev) throw new Error("missing reading");
          const within = (t: number) => t > prev.nightSecond && t <= next.nightSecond;
          return {
            candy,
            rise: Math.round((next.weightG - prev.weightG) / candy.gramsPerPiece),
            refills: bowl.refills.filter((r) => within(r.nightSecond)).length,
            given: taken.filter((h) => within(h.nightSecond)).reduce((sum, h) => sum + h.pieces, 0),
          };
        });
      });
    });

    it("there is at most one refill and fewer than a bag given", () => {
      expect(intervals.some((iv) => iv.refills === 1)).toBe(true);
      // One assertion over the whole sweep: an expect per interval is slow at this size.
      expect(intervals.filter((iv) => iv.refills > 1 || iv.given >= iv.candy.piecesPerBag)).toEqual(
        [],
      );
    });

    it("a fall of n is n given, and a rise of r is a bag less r given", () => {
      const read = ({ candy, rise }: (typeof intervals)[number]) =>
        rise < 0 ? -rise : Math.ceil(rise / candy.piecesPerBag) * candy.piecesPerBag - rise;
      expect(intervals.filter((iv) => read(iv) !== iv.given)).toEqual([]);
    });
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
