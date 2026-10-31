import { describe, expect, it } from "vitest";
import { doorScanRows, generateDoorScans, type DoorScan } from "./door-scans";
import { generateHouses } from "./houses";
import { FALL_BACK_SECOND, NIGHT_SECONDS, secondsAt } from "./night-clock";
import { generateTrickOrTreaters } from "./trick-or-treaters";

const SEEDS = Array.from({ length: 20 }, (_, i) => `seed-${String(i)}`);
const HOUR = 3600;

function night(seed: string) {
  const houses = generateHouses(seed);
  const kids = generateTrickOrTreaters(seed, houses);
  return { houses, kids, scans: generateDoorScans(seed, houses, kids) };
}

function inHour(scans: readonly DoorScan[], start: number): number {
  return scans.filter((s) => s.nightSecond >= start && s.nightSecond < start + HOUR).length;
}

describe("door scans", () => {
  it("are the same for the same seed", () => {
    expect(night("raven-pumpkin-13").scans).toEqual(night("raven-pumpkin-13").scans);
  });

  it("differ between seeds", () => {
    expect(night("raven-pumpkin-13").scans).not.toEqual(night("raven-pumpkin-14").scans);
  });

  it("become feed rows with only the scanner's view of time", () => {
    const [scan] = night("raven-pumpkin-13").scans;
    if (!scan) throw new Error("The night has no scans.");
    expect(doorScanRows([scan])).toEqual([
      {
        device_id: scan.deviceId,
        seq: scan.seq,
        house_id: scan.houseId,
        kid_id: scan.kidId,
        scanned_at_local: scan.scannedAtLocal,
        utc_offset: scan.utcOffset,
      },
    ]);
  });

  describe.each(SEEDS)("seed %s", (seed) => {
    const { houses, kids, scans } = night(seed);
    const houseById = new Map(houses.map((h) => [h.houseId, h]));
    const kidById = new Map(kids.map((k) => [k.kidId, k]));

    it("all fall between 18:00 CDT and 03:00 CST, in true-time order", () => {
      expect(scans.length).toBeGreaterThan(0);
      for (const [i, scan] of scans.entries()) {
        expect(scan.nightSecond).toBeGreaterThanOrEqual(0);
        expect(scan.nightSecond).toBeLessThan(NIGHT_SECONDS);
        expect(scan.nightSecond).toBeGreaterThanOrEqual(scans[i - 1]?.nightSecond ?? 0);
        expect(secondsAt(scan.scannedAtLocal)).toContain(scan.nightSecond);
        expect(scan.utcOffset).toBe(scan.nightSecond < FALL_BACK_SECOND ? "-05:00" : "-06:00");
      }
    });

    it("peak between 19:00 and 20:00 and taper off", () => {
      const hours = Array.from({ length: 10 }, (_, h) => inHour(scans, h * HOUR));
      expect(Math.max(...hours)).toBe(hours[1]);
      expect(hours.slice(4).every((n) => n < (hours[1] ?? 0) / 4)).toBe(true);
    });

    it("happen in both 1am hours", () => {
      expect(inHour(scans, FALL_BACK_SECOND - HOUR)).toBeGreaterThan(0);
      expect(inHour(scans, FALL_BACK_SECOND)).toBeGreaterThan(0);
    });

    it("come from real kids at candy-giving houses, one scanner per house", () => {
      const deviceOf = new Map<string, string>();
      const houseOf = new Map<string, string>();
      for (const scan of scans) {
        expect(kidById.has(scan.kidId)).toBe(true);
        expect(houseById.get(scan.houseId)?.givesCandy).toBe(true);
        expect(deviceOf.get(scan.houseId) ?? scan.deviceId).toBe(scan.deviceId);
        expect(houseOf.get(scan.deviceId) ?? scan.houseId).toBe(scan.houseId);
        deviceOf.set(scan.houseId, scan.deviceId);
        houseOf.set(scan.deviceId, scan.houseId);
      }
    });

    it("number each scanner's reads 1 to n in true-time order", () => {
      for (const reads of Map.groupBy(scans, (s) => s.deviceId).values()) {
        expect(reads.map((s) => s.seq)).toEqual(reads.map((_, i) => i + 1));
      }
    });

    it("never put a kid at two doors at once", () => {
      for (const visits of Map.groupBy(scans, (s) => s.kidId).values()) {
        for (let i = 1; i < visits.length; i++) {
          const gap = (visits[i]?.nightSecond ?? 0) - (visits[i - 1]?.nightSecond ?? 0);
          expect(gap).toBeGreaterThanOrEqual(30);
        }
        expect(new Set(visits.map((s) => s.houseId)).size).toBe(visits.length);
      }
    });

    it("keep each group together at every door", () => {
      const groupOf = new Map(kids.map((k) => [k.kidId, k.groupId]));
      const visits = Map.groupBy(scans, (s) => `${groupOf.get(s.kidId) ?? ""}@${s.houseId}`);
      for (const [visit, reads] of visits) {
        const groupId = visit.split("@")[0];
        const members = kids.filter((k) => k.groupId === groupId).length;
        expect(reads.length).toBe(members);
        const times = reads.map((s) => s.nightSecond);
        expect(Math.max(...times) - Math.min(...times)).toBeLessThan(60);
      }
    });
  });
});
