import { describe, expect, it } from "vitest";
import { dailyDateLabel, dailyRunHref, nextDailyAt, waitUntil } from "./daily";

describe("nextDailyAt", () => {
  it("is the coming midnight UTC, across month and year ends", () => {
    expect(nextDailyAt("2026-10-31")).toBe("2026-11-01T00:00:00.000Z");
    expect(nextDailyAt("2026-12-31")).toBe("2027-01-01T00:00:00.000Z");
  });
});

describe("waitUntil", () => {
  const next = "2026-11-01T00:00:00.000Z";
  it.each([
    ["2026-10-31T17:48:00Z", "6 hours 12 minutes"],
    ["2026-10-31T23:00:00Z", "1 hour"],
    ["2026-10-31T22:59:00Z", "1 hour 1 minute"],
    ["2026-10-31T23:58:00Z", "2 minutes"],
    // Never "0 minutes": the board rounds up until the new seed is posted.
    ["2026-10-31T23:59:59Z", "1 minute"],
  ])("from %s is %s", (now, words) => {
    expect(waitUntil(next, new Date(now))).toBe(words);
  });
});

describe("dailyDateLabel", () => {
  it("writes the UTC date the way the town does", () => {
    expect(dailyDateLabel("2026-10-31")).toBe("Saturday, October 31");
  });
});

describe("dailyRunHref", () => {
  it("starts a run on the day's seed, flagged as the Daily Haunt", () => {
    expect(dailyRunHref("phantom-gumdrop-79")).toBe("/run/new?seed=phantom-gumdrop-79&daily=1");
  });
});
