import { describe, expect, it } from "vitest";
import { clockAt, FALL_BACK_SECOND, NIGHT_SECONDS, secondsAt } from "./night-clock";

const HOUR = 3600;

// 18:00 CDT on Oct 31, 2026 is 23:00 UTC. Date.UTC is pure arithmetic, so it checks the clock
// without touching any time zone database.
const NIGHT_START_UTC_MS = Date.UTC(2026, 9, 31, 23, 0, 0);

function utcMs(local: string, offset: string): number {
  return Date.parse(`${local.replace(" ", "T")}${offset}`);
}

describe("clockAt", () => {
  it.each([
    [0, "2026-10-31 18:00:00", "-05:00"],
    [6 * HOUR - 1, "2026-10-31 23:59:59", "-05:00"],
    [6 * HOUR, "2026-11-01 00:00:00", "-05:00"],
    [7 * HOUR - 1, "2026-11-01 00:59:59", "-05:00"],
    [7 * HOUR, "2026-11-01 01:00:00", "-05:00"],
    [8 * HOUR - 1, "2026-11-01 01:59:59", "-05:00"],
    [8 * HOUR, "2026-11-01 01:00:00", "-06:00"],
    [10 * HOUR - 1, "2026-11-01 02:59:59", "-06:00"],
    [10 * HOUR, "2026-11-01 03:00:00", "-06:00"],
  ])("reads night second %i as %s %s", (second, local, utcOffset) => {
    expect(clockAt(second)).toEqual({ local, utcOffset });
  });

  it("falls back at 02:00 CDT, which is 07:00 UTC", () => {
    expect(FALL_BACK_SECOND).toBe(8 * HOUR);
    expect(NIGHT_START_UTC_MS + FALL_BACK_SECOND * 1000).toBe(Date.UTC(2026, 10, 1, 7));
    expect(NIGHT_START_UTC_MS + NIGHT_SECONDS * 1000).toBe(Date.UTC(2026, 10, 1, 9));
  });

  it("names the true instant through local time plus offset, every second of the night", () => {
    for (let second = 0; second <= NIGHT_SECONDS; second++) {
      const { local, utcOffset } = clockAt(second);
      if (utcMs(local, utcOffset) !== NIGHT_START_UTC_MS + second * 1000) {
        throw new Error(`Night second ${String(second)} reads ${local}${utcOffset}.`);
      }
    }
  });

  it.each([-1, NIGHT_SECONDS + 1, 1.5, Number.NaN])("refuses %d", (second) => {
    expect(() => clockAt(second)).toThrow(RangeError);
  });
});

describe("secondsAt", () => {
  it("is ambiguous in the repeated 1am hour and nowhere else", () => {
    for (let second = 0; second <= NIGHT_SECONDS; second++) {
      const { local } = clockAt(second);
      const matches = secondsAt(local);
      const repeated = local.startsWith("2026-11-01 01:");
      const expected = repeated
        ? [
            second < FALL_BACK_SECOND ? second : second - HOUR,
            second < FALL_BACK_SECOND ? second + HOUR : second,
          ]
        : [second];
      if (JSON.stringify(matches) !== JSON.stringify(expected)) {
        throw new Error(`${local} maps to ${JSON.stringify(matches)}.`);
      }
    }
  });

  it("finds nothing outside the night", () => {
    expect(secondsAt("2026-10-31 17:59:59")).toEqual([]);
    expect(secondsAt("2026-11-01 03:00:01")).toEqual([]);
    expect(secondsAt("2026-11-01 25:00:00")).toEqual([]);
  });

  it("refuses text that isn't a Halloween-night timestamp", () => {
    expect(() => secondsAt("2026-11-01T01:30:00")).toThrow(RangeError);
    expect(() => secondsAt("2026-11-02 01:30:00")).toThrow(RangeError);
  });
});
