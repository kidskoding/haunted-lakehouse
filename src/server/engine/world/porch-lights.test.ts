import { describe, expect, it } from "vitest";
import { generateDoorScans } from "./door-scans";
import { generateHouses } from "./houses";
import { NIGHT_SECONDS, secondsAt } from "./night-clock";
import {
  generatePorchLights,
  isLit,
  lastReportedState,
  porchLightRows,
  type PorchLight,
} from "./porch-lights";
import { generateTrickOrTreaters } from "./trick-or-treaters";

const SEEDS = Array.from({ length: 20 }, (_, i) => `seed-${String(i)}`);
const ROW_BUDGET = 1_000;

function night(seed: string) {
  const houses = generateHouses(seed);
  const kids = generateTrickOrTreaters(seed, houses);
  const scans = generateDoorScans(seed, houses, kids);
  return { houses, scans, ...generatePorchLights(seed, houses, scans) };
}

const allNights = SEEDS.map(night);

function silent(lights: readonly PorchLight[]): PorchLight[] {
  return lights.filter((l) => l.diesAt !== null);
}

describe("porch lights", () => {
  it("are the same for the same seed", () => {
    expect(night("raven-pumpkin-13")).toEqual(night("raven-pumpkin-13"));
  });

  it("differ between seeds", () => {
    const a = night("raven-pumpkin-13");
    const b = night("raven-pumpkin-14");
    expect(a.lights).not.toEqual(b.lights);
    expect(a.events).not.toEqual(b.events);
  });

  it("include silent sensors in most nights, but only ever a minority", () => {
    const withSilence = allNights.filter((n) => silent(n.lights).length > 0).length;
    expect(withSilence).toBeGreaterThanOrEqual(14);
    const share =
      allNights.reduce((sum, n) => sum + silent(n.lights).length, 0) /
      allNights.reduce((sum, n) => sum + n.lights.length, 0);
    expect(share).toBeGreaterThan(0.03);
    expect(share).toBeLessThan(0.15);
  });

  it("include dark houses that flick a light on, and giving houses that take a break", () => {
    const flicks = allNights.flatMap((n) =>
      n.lights.filter(
        (l) => l.lit.length > 0 && !n.houses.find((h) => h.houseId === l.houseId)?.givesCandy,
      ),
    );
    const breaks = allNights.flatMap((n) => n.lights.filter((l) => l.lit.length > 1));
    expect(flicks.length).toBeGreaterThan(0);
    expect(breaks.length).toBeGreaterThan(flicks.length);
  });

  it("become feed rows with only the sensor's view of time", () => {
    const [event] = night("raven-pumpkin-13").events;
    if (!event) throw new Error("The night has no porch-light events.");
    expect(porchLightRows([event])).toEqual([
      {
        device_id: event.deviceId,
        seq: event.seq,
        house_id: event.houseId,
        state: event.state,
        changed_at_local: event.changedAtLocal,
        utc_offset: event.utcOffset,
      },
    ]);
  });

  describe.each(SEEDS.map((seed, i) => [seed, allNights[i]] as const))("seed %s", (_, data) => {
    if (!data) throw new Error("missing night");
    const { houses, scans, lights, events } = data;
    const lightOf = new Map(lights.map((l) => [l.houseId, l]));
    const byDevice = Map.groupBy(events, (e) => e.deviceId);

    it("puts one sensor with a unique id on every house", () => {
      expect(lights.map((l) => l.houseId)).toEqual(houses.map((h) => h.houseId));
      expect(new Set(lights.map((l) => l.deviceId)).size).toBe(lights.length);
    });

    it("stays within the night, in true-time order, under the row budget", () => {
      expect(events.length).toBeLessThan(ROW_BUDGET);
      for (const [i, event] of events.entries()) {
        const prev = events[i - 1];
        expect(event.nightSecond).toBeGreaterThanOrEqual(0);
        expect(event.nightSecond).toBeLessThan(NIGHT_SECONDS);
        expect(secondsAt(event.changedAtLocal)).toContain(event.nightSecond);
        if (prev) {
          const ordered =
            prev.nightSecond < event.nightSecond ||
            (prev.nightSecond === event.nightSecond && prev.deviceId < event.deviceId);
          expect(ordered).toBe(true);
        }
      }
    });

    it("numbers each sensor's changes 1..n and alternates on and off, starting on", () => {
      for (const own of byDevice.values()) {
        expect(own.map((e) => e.seq)).toEqual(own.map((_, i) => i + 1));
        expect(own.map((e) => e.state)).toEqual(own.map((_, i) => (i % 2 === 0 ? "on" : "off")));
      }
    });

    it("reports exactly the true changes before the battery dies, and none after", () => {
      for (const light of lights) {
        const truth = light.lit.flatMap((s) => [s.from, ...(s.to < NIGHT_SECONDS ? [s.to] : [])]);
        const reported = (byDevice.get(light.deviceId) ?? []).map((e) => e.nightSecond);
        const { diesAt } = light;
        if (diesAt === null) {
          expect(reported).toEqual(truth);
        } else {
          expect(reported).toEqual(truth.filter((t) => t < diesAt));
          expect(reported.length).toBeGreaterThan(0);
          expect(truth.some((t) => t >= diesAt)).toBe(true);
        }
      }
    });

    it("keeps the light on for every knock at the door", () => {
      for (const scan of scans) {
        const light = lightOf.get(scan.houseId);
        if (!light) throw new Error(`No light for ${scan.houseId}`);
        expect(isLit(light, scan.nightSecond)).toBe(true);
      }
    });

    it("tells the true state apart from the last report only for silent sensors", () => {
      for (const light of lights) {
        for (let t = 0; t < NIGHT_SECONDS; t += 300) {
          const truth = isLit(light, t) ? "on" : "off";
          const reported = lastReportedState(light, t);
          if (light.diesAt === null || t < light.diesAt) expect(reported).toBe(truth);
        }
      }
      for (const light of silent(lights)) {
        const { diesAt } = light;
        const lost = light.lit
          .flatMap((s) => [s.from, s.to])
          .find((t) => diesAt !== null && t >= diesAt && t < NIGHT_SECONDS);
        if (lost === undefined) throw new Error("A silent sensor lost no change.");
        // The first change it missed is real, so from then on its last report is stale.
        expect(lastReportedState(light, lost)).not.toBe(isLit(light, lost) ? "on" : "off");
      }
    });
  });
});
