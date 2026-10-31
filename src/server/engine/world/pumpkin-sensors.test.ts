import { describe, expect, it } from "vitest";
import { generateHouses } from "./houses";
import {
  generatePumpkinSensors,
  NIGHT_LENGTH,
  pumpkinReadingRows,
  type PumpkinReading,
} from "./pumpkin-sensors";

const SEEDS = Array.from({ length: 20 }, (_, i) => `seed-${String(i)}`);
const MINUTE = 60;
// Local 00:00 CDT is 05:00 UTC, five hours after the 18:00 CDT start.
const MIDNIGHT = 5 * 3600;
const ROW_BUDGET = 30_000;

function night(seed: string) {
  const houses = generateHouses(seed);
  return { houses, ...generatePumpkinSensors(seed, houses) };
}

function mean(values: readonly number[]): number {
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function bySensor(readings: readonly PumpkinReading[]) {
  return Map.groupBy(readings, (r) => r.sensorId);
}

const allNights = SEEDS.map(night);

describe("pumpkin sensors", () => {
  it("are the same for the same seed", () => {
    expect(night("raven-pumpkin-13")).toEqual(night("raven-pumpkin-13"));
  });

  it("differ between seeds", () => {
    const a = night("raven-pumpkin-13");
    const b = night("raven-pumpkin-14");
    expect(a.sensors).not.toEqual(b.sensors);
    expect(a.readings).not.toEqual(b.readings);
  });

  it("include burn-outs before 03:00, candles still burning after midnight, relights and gusts of wind", () => {
    const burns = allNights.flatMap((n) => n.sensors.flatMap((s) => s.burns));
    const endings = burns.map((b) => b.ending);
    expect(endings).toContain("burned-out");
    expect(endings).toContain("blown-out");
    expect(burns.some((b) => b.outAt > MIDNIGHT)).toBe(true);
    expect(allNights.flatMap((n) => n.sensors).some((s) => s.burns.length === 2)).toBe(true);
  });

  describe.each(SEEDS.map((seed, i) => [seed, allNights[i]] as const))("seed %s", (_, data) => {
    if (!data) throw new Error("missing night");
    const { houses, sensors, readings } = data;
    const groups = bySensor(readings);

    it("puts a pumpkin on a believable share of real porches", () => {
      const houseIds = new Set(houses.map((h) => h.houseId));
      expect(sensors.length).toBeGreaterThanOrEqual(8);
      expect(sensors.length).toBeLessThan(houses.length / 2);
      expect(new Set(sensors.map((s) => s.sensorId)).size).toBe(sensors.length);
      expect(new Set(sensors.map((s) => s.houseId)).size).toBe(sensors.length);
      for (const r of readings) expect(houseIds.has(r.houseId)).toBe(true);
    });

    it("stays within the night and the row budget", () => {
      expect(readings.length).toBeLessThan(ROW_BUDGET);
      for (const r of readings) {
        expect(r.secondsIntoNight).toBeGreaterThanOrEqual(0);
        expect(r.secondsIntoNight).toBeLessThan(NIGHT_LENGTH);
        expect(r.readAtUtc >= "2026-10-31 23:00:00").toBe(true);
        expect(r.readAtUtc < "2026-11-01 09:00:00").toBe(true);
      }
    });

    it("is sorted by time then sensor, with unique reading ids", () => {
      expect(new Set(readings.map((r) => r.readingId)).size).toBe(readings.length);
      for (let i = 1; i < readings.length; i++) {
        const [prev, next] = [readings[i - 1], readings[i]];
        if (!prev || !next) throw new Error("missing reading");
        const ordered =
          prev.secondsIntoNight < next.secondsIntoNight ||
          (prev.secondsIntoNight === next.secondsIntoNight && prev.sensorId < next.sensorId);
        expect(ordered).toBe(true);
      }
    });

    it("numbers each sensor's readings 1..n, about a minute apart", () => {
      for (const own of groups.values()) {
        expect(own.map((r) => r.seq)).toEqual(own.map((_, i) => i + 1));
        for (let i = 1; i < own.length; i++) {
          const gap = (own[i]?.secondsIntoNight ?? 0) - (own[i - 1]?.secondsIntoNight ?? 0);
          expect(gap).toBeGreaterThanOrEqual(50);
          expect(gap).toBeLessThanOrEqual(70);
        }
      }
    });

    it("reads zero exactly when no candle is lit, and a finite flame otherwise", () => {
      for (const sensor of sensors) {
        for (const r of groups.get(sensor.sensorId) ?? []) {
          expect(Number.isFinite(r.flameLux)).toBe(true);
          const lit = sensor.burns.some(
            (b) => r.secondsIntoNight >= b.litAt && r.secondsIntoNight < b.outAt,
          );
          if (lit) expect(r.flameLux).toBeGreaterThan(0);
          else expect(r.flameLux).toBe(0);
        }
      }
    });

    it("sends a few zeros after a candle goes out for good, then falls silent", () => {
      for (const sensor of sensors) {
        const last = sensor.burns.at(-1);
        const own = groups.get(sensor.sensorId) ?? [];
        if (!last || last.ending === "still-lit") continue;
        const zeros = own.filter((r) => r.secondsIntoNight >= last.outAt);
        const cutByDawn = (own.at(-1)?.secondsIntoNight ?? 0) + 70 >= NIGHT_LENGTH;
        expect(zeros.length).toBeLessThanOrEqual(5);
        if (!cutByDawn) expect(zeros.length).toBeGreaterThanOrEqual(2);
      }
    });

    it("dims over each full burn and gutters before going out", () => {
      for (const sensor of sensors) {
        const own = groups.get(sensor.sensorId) ?? [];
        for (const burn of sensor.burns.filter((b) => b.ending === "burned-out")) {
          const lux = (from: number, to: number) =>
            own.filter((r) => r.secondsIntoNight >= from && r.secondsIntoNight < to);
          const early = lux(burn.litAt, burn.litAt + 30 * MINUTE).map((r) => r.flameLux);
          const late = lux(burn.outAt - 30 * MINUTE, burn.outAt).map((r) => r.flameLux);
          expect(mean(early)).toBeGreaterThan(mean(late));
        }
      }
    });

    it("maps to tight snake_case feed rows", () => {
      const rows = pumpkinReadingRows(readings);
      expect(rows).toHaveLength(readings.length);
      expect(Object.keys(rows[0] ?? {})).toEqual([
        "reading_id",
        "sensor_id",
        "house_id",
        "seq",
        "read_at_utc",
        "flame_lux",
      ]);
    });
  });
});
