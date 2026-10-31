import { describe, expect, it } from "vitest";
import { formatUtcTimestamp } from "./utc-timestamp";

describe("formatUtcTimestamp", () => {
  it("agrees with the platform's UTC calendar across eras, leap days and month ends", () => {
    const samples = [
      0, 951_782_400, 951_868_799, 1_709_164_800, 1_793_487_600, 1_793_523_599, 4_102_444_800,
      -86_401,
    ];
    for (const seconds of samples) {
      const expected = new Date(seconds * 1000).toISOString().slice(0, 19).replace("T", " ");
      expect(formatUtcTimestamp(seconds)).toBe(expected);
    }
  });

  it("formats the start of Halloween night in DuckDB's timestamp form", () => {
    expect(formatUtcTimestamp(1_793_487_600)).toBe("2026-10-31 23:00:00");
  });

  it("rejects fractional seconds", () => {
    expect(() => formatUtcTimestamp(1.5)).toThrow(RangeError);
  });
});
