import { describe, expect, it } from "vitest";
import { generateDoorScans } from "./door-scans";
import {
  HAYRIDE_CLOSES,
  HAYRIDE_GATES,
  HAYRIDE_OPENS,
  generateHayrideTaps,
  hayrideTapRows,
  type HayrideTap,
} from "./hayride";
import { generateHouses } from "./houses";
import { secondsAt } from "./night-clock";
import { generateTrickOrTreaters } from "./trick-or-treaters";

const SEEDS = Array.from({ length: 20 }, (_, i) => `seed-${String(i)}`);
const MINUTE = 60;

function night(seed: string) {
  const houses = generateHouses(seed);
  const kids = generateTrickOrTreaters(seed, houses);
  const scans = generateDoorScans(seed, houses, kids);
  return { kids, scans, taps: generateHayrideTaps(seed, kids, scans) };
}

/** Each kid's rides as [tap-in, tap-out] pairs, failing if the taps don't alternate in, out. */
function ridesOf(taps: readonly HayrideTap[]): Map<string, [HayrideTap, HayrideTap][]> {
  const rides = new Map<string, [HayrideTap, HayrideTap][]>();
  for (const [kidId, own] of Map.groupBy(taps, (t) => t.kidId)) {
    const pairs: [HayrideTap, HayrideTap][] = [];
    for (let i = 0; i < own.length; i += 2) {
      const [tapIn, tapOut] = [own[i], own[i + 1]];
      if (tapIn?.direction !== "in" || tapOut?.direction !== "out") {
        throw new Error(`${kidId}'s taps don't pair up in, out.`);
      }
      pairs.push([tapIn, tapOut]);
    }
    rides.set(kidId, pairs);
  }
  return rides;
}

const ridersPerSeed = SEEDS.map((seed) => new Set(night(seed).taps.map((t) => t.kidId)).size);

describe("hayride taps", () => {
  it("are the same for the same seed", () => {
    expect(night("raven-pumpkin-13").taps).toEqual(night("raven-pumpkin-13").taps);
  });

  it("differ between seeds", () => {
    expect(night("raven-pumpkin-13").taps).not.toEqual(night("raven-pumpkin-14").taps);
  });

  it("become feed rows with only the reader's view of time", () => {
    const [tap] = night("raven-pumpkin-13").taps;
    if (!tap) throw new Error("Nobody rode the hayride.");
    expect(hayrideTapRows([tap])).toEqual([
      {
        device_id: tap.deviceId,
        seq: tap.seq,
        gate: tap.gate,
        kid_id: tap.kidId,
        direction: tap.direction,
        tapped_at_local: tap.tappedAtLocal,
        utc_offset: tap.utcOffset,
      },
    ]);
  });

  it("carry riders in every seed, but only a minority of kids", () => {
    for (const [i, riders] of ridersPerSeed.entries()) {
      const { kids } = night(SEEDS[i] ?? "");
      expect(riders).toBeGreaterThanOrEqual(10);
      expect(riders).toBeLessThan(kids.length / 2);
    }
    expect(ridersPerSeed.reduce((a, b) => a + b, 0)).toBeGreaterThan(20 * 20);
  });

  it("take some groups round twice somewhere across the seeds", () => {
    const twice = SEEDS.some((seed) =>
      [...ridesOf(night(seed).taps).values()].some((rides) => rides.length === 2),
    );
    expect(twice).toBe(true);
  });

  describe.each(SEEDS)("seed %s", (seed) => {
    const { kids, scans, taps } = night(seed);
    const rides = ridesOf(taps);

    it("fall while the wagon runs, in true-time order", () => {
      for (const [i, tap] of taps.entries()) {
        expect(tap.nightSecond).toBeGreaterThanOrEqual(HAYRIDE_OPENS);
        expect(tap.nightSecond).toBeLessThanOrEqual(HAYRIDE_CLOSES);
        expect(tap.nightSecond).toBeGreaterThanOrEqual(taps[i - 1]?.nightSecond ?? 0);
        expect(secondsAt(tap.tappedAtLocal)).toEqual([tap.nightSecond]);
        expect(tap.utcOffset).toBe("-05:00");
      }
    });

    it("pair every tap-in with a later tap-out, 10 to 25 minutes on", () => {
      for (const pairs of rides.values()) {
        for (const [tapIn, tapOut] of pairs) {
          const ride = tapOut.nightSecond - tapIn.nightSecond;
          expect(ride).toBeGreaterThanOrEqual(10 * MINUTE);
          // Tapping on and off takes a few seconds per member on top of the ride itself.
          expect(ride).toBeLessThanOrEqual(25 * MINUTE + MINUTE);
        }
      }
    });

    it("never let a kid scan a door while on the wagon", () => {
      const scansOf = Map.groupBy(scans, (s) => s.kidId);
      for (const [kidId, pairs] of rides) {
        for (const [tapIn, tapOut] of pairs) {
          const onBoard = (scansOf.get(kidId) ?? []).filter(
            (s) => s.nightSecond >= tapIn.nightSecond && s.nightSecond <= tapOut.nightSecond,
          );
          expect(onBoard).toEqual([]);
        }
      }
    });

    it("leave time to walk between a door and the wagon", () => {
      const scansOf = Map.groupBy(scans, (s) => s.kidId);
      for (const [kidId, pairs] of rides) {
        for (const [tapIn, tapOut] of pairs) {
          for (const scan of scansOf.get(kidId) ?? []) {
            const clear =
              scan.nightSecond <= tapIn.nightSecond - 4 * MINUTE ||
              scan.nightSecond >= tapOut.nightSecond + 4 * MINUTE;
            expect(clear).toBe(true);
          }
        }
      }
    });

    it("come from real kids at the town's gates, one reader per gate", () => {
      const kidIds = new Set(kids.map((k) => k.kidId));
      const readerOf = new Map<string, string>();
      for (const tap of taps) {
        expect(kidIds.has(tap.kidId)).toBe(true);
        expect(HAYRIDE_GATES).toContain(tap.gate);
        expect(readerOf.get(tap.gate) ?? tap.deviceId).toBe(tap.deviceId);
        readerOf.set(tap.gate, tap.deviceId);
      }
      expect(new Set(readerOf.values()).size).toBe(readerOf.size);
    });

    it("number each reader's taps 1 to n in true-time order", () => {
      for (const reads of Map.groupBy(taps, (t) => t.deviceId).values()) {
        expect(reads.map((t) => t.seq)).toEqual(reads.map((_, i) => i + 1));
      }
    });

    it("keep each group together on every ride", () => {
      const groupOf = new Map(kids.map((k) => [k.kidId, k.groupId]));
      for (const [groupId, members] of Map.groupBy(kids, (k) => k.groupId)) {
        const memberRides = members.map((k) => rides.get(k.kidId) ?? []);
        const [first] = memberRides;
        if (!first) continue;
        for (const own of memberRides) expect(own.length).toBe(first.length);
        first.forEach(([tapIn, tapOut], r) => {
          const ins = memberRides.map((own) => own[r]?.[0]);
          const outs = memberRides.map((own) => own[r]?.[1]);
          for (const [taps, lead] of [
            [ins, tapIn],
            [outs, tapOut],
          ] as const) {
            for (const tap of taps) {
              expect(tap?.gate).toBe(lead.gate);
              expect(Math.abs((tap?.nightSecond ?? 0) - lead.nightSecond)).toBeLessThan(MINUTE);
              expect(groupOf.get(tap?.kidId ?? "")).toBe(groupId);
            }
          }
        });
      }
    });
  });
});

describe("groups that ride twice", () => {
  it("never board again before getting off, across many seeds", () => {
    for (let i = 0; i < 300; i++) {
      const { taps } = night(`twice-${String(i)}`);
      const byKid = Map.groupBy(taps, (t) => t.kidId);
      for (const kidTaps of byKid.values()) {
        expect(kidTaps.map((t) => t.direction).join(",")).toMatch(/^(in,out)(,in,out)*$/);
      }
    }
  });
});
