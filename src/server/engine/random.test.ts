import { afterEach, describe, expect, it, vi } from "vitest";
import { rngFor, type Rng, type SeedKey } from "./random";

const key: SeedKey = ["porch-lights", "raven-pumpkin-13", 1];

function floats(rng: Rng, count: number): number[] {
  return Array.from({ length: count }, () => rng.float());
}

describe("rngFor", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("produces the same stream for the same key", () => {
    expect(floats(rngFor(key), 100)).toEqual(floats(rngFor([...key]), 100));
  });

  it("is stable across releases", () => {
    // Pinned outputs: if these change, every seed in every Graveyard replays differently.
    const rng = rngFor(key);
    expect([rng.int(0, 1_000_000), rng.int(0, 1_000_000), rng.int(0, 1_000_000)]).toEqual(
      PINNED_INTS,
    );
  });

  it.each<[string, SeedKey]>([
    ["puzzle", ["thirteenth-door", "raven-pumpkin-13", 1]],
    ["run seed", ["porch-lights", "raven-pumpkin-14", 1]],
    ["slot", ["porch-lights", "raven-pumpkin-13", 2]],
    ["sub-stream label", ["porch-lights", "raven-pumpkin-13", 1, "houses"]],
  ])("gives an unrelated stream when only the %s differs", (_, other) => {
    expect(floats(rngFor(other), 20)).not.toEqual(floats(rngFor(key), 20));
  });

  it("never lets key parts run together", () => {
    expect(floats(rngFor(["a", "b-c", 1]), 20)).not.toEqual(floats(rngFor(["a-b", "c", 1]), 20));
    expect(floats(rngFor(["a", "b", 1, "2"]), 20)).not.toEqual(
      floats(rngFor(["a", "b", 1, 2]), 20),
    );
  });

  it("keeps sibling streams independent of how much the other one drew", () => {
    const houses = rngFor([...key, "houses"]);
    const kidsBefore = floats(rngFor([...key, "kids"]), 10);
    floats(houses, 1000);
    expect(floats(rngFor([...key, "kids"]), 10)).toEqual(kidsBefore);
  });

  it("never reads global randomness or the clock", () => {
    const random = vi.spyOn(Math, "random");
    const now = vi.spyOn(Date, "now");
    const rng = rngFor(key);
    floats(rng, 100);
    rng.int(0, 10);
    rng.pick(["a", "b"]);
    expect(random).not.toHaveBeenCalled();
    expect(now).not.toHaveBeenCalled();
  });

  it("draws floats in [0, 1) and integers in [min, max)", () => {
    const rng = rngFor(key);
    for (let i = 0; i < 10_000; i++) {
      const f = rng.float();
      expect(f).toBeGreaterThanOrEqual(0);
      expect(f).toBeLessThan(1);
      const n = rng.int(-3, 4);
      expect(Number.isInteger(n) && n >= -3 && n < 4).toBe(true);
    }
  });

  it("spreads draws roughly evenly", () => {
    const rng = rngFor(key);
    const counts = new Array<number>(10).fill(0);
    const draws = 100_000;
    for (let i = 0; i < draws; i++) {
      const bucket = rng.int(0, 10);
      counts[bucket] = (counts[bucket] ?? 0) + 1;
    }
    for (const count of counts) {
      expect(Math.abs(count - draws / 10)).toBeLessThan(draws / 100);
    }
  });

  it("picks every element of a list eventually, and only those", () => {
    const rng = rngFor(key);
    const items = ["a", "b", "c"] as const;
    const seen = new Set(Array.from({ length: 200 }, () => rng.pick(items)));
    expect([...seen].sort()).toEqual(["a", "b", "c"]);
  });

  it("rejects ranges it cannot draw from", () => {
    const rng = rngFor(key);
    expect(() => rng.int(3, 3)).toThrow(RangeError);
    expect(() => rng.int(0, 1.5)).toThrow(RangeError);
    expect(() => rng.int(0, 2 ** 33)).toThrow(RangeError);
    expect(() => rng.pick([])).toThrow(RangeError);
  });
});

const PINNED_INTS = [247912, 343395, 171441];
