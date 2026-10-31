import { describe, expect, it } from "vitest";
import { clockHandHour, REST_MS, START_HOUR, SWEEP_MS, sweepTarget } from "./candle-clock-art";

describe("clockHandHour", () => {
  it("opens the night resting on the start hour", () => {
    expect(clockHandHour(0)).toBe(START_HOUR);
    expect(clockHandHour(REST_MS - 1)).toBe(START_HOUR);
  });

  it("sweeps to the next hour and lands exactly on it", () => {
    expect(clockHandHour(REST_MS + SWEEP_MS / 2)).toBeCloseTo(START_HOUR + 0.5, 5);
    expect(clockHandHour(REST_MS + SWEEP_MS)).toBe(START_HOUR + 1);
  });

  it("wraps around the twelve-hour dial", () => {
    const hoursToMidnight = 12 - START_HOUR;
    expect(clockHandHour(hoursToMidnight * (REST_MS + SWEEP_MS))).toBe(0);
  });
});

describe("sweepTarget", () => {
  it("sweeps forward past midnight rather than back round the dial", () => {
    expect(sweepTarget(11 + 50 / 60, 10 / 60)).toBeCloseTo(12 + 10 / 60, 5);
  });

  it("sweeps back when the clocks fall back", () => {
    expect(sweepTarget(1 + 59 / 60, 1)).toBeCloseTo(1, 5);
  });

  it("keeps a hand already on its hour still", () => {
    expect(sweepTarget(7.25, 7.25)).toBe(7.25);
  });
});
