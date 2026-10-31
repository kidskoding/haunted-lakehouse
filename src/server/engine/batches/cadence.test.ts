import { describe, expect, it } from "vitest";
import { NIGHT_SECONDS } from "../world/night-clock";
import { batchLandingBy, landingSeconds } from "./cadence";

describe("landingSeconds", () => {
  it("steps from the start through the end, landing on the end only when the step reaches it", () => {
    expect(landingSeconds({ every: 900, from: 900, until: 3600 })).toEqual([900, 1800, 2700, 3600]);
    expect(landingSeconds({ every: 900, from: 0, until: 2000 })).toEqual([0, 900, 1800]);
  });

  it("keeps explicit landings as given", () => {
    expect(landingSeconds({ at: [60, 3600, NIGHT_SECONDS] })).toEqual([60, 3600, NIGHT_SECONDS]);
  });

  it("rejects landings outside the night and steps that go nowhere", () => {
    expect(() => landingSeconds({ at: [NIGHT_SECONDS + 1] })).toThrow(/second of the night/);
    expect(() => landingSeconds({ every: 0, from: 0, until: 60 })).toThrow(/positive second/);
    expect(() => landingSeconds({ at: [120, 60] })).toThrow(/strictly increase/);
  });
});

describe("batchLandingBy", () => {
  const landings = [600, 1200, 1800];

  it("finds the first landing at or after a second", () => {
    expect(batchLandingBy(landings, 0)).toBe(0);
    expect(batchLandingBy(landings, 600)).toBe(0);
    expect(batchLandingBy(landings, 601)).toBe(1);
    expect(batchLandingBy(landings, 1800)).toBe(2);
    expect(batchLandingBy(landings, 1801)).toBeUndefined();
  });
});
