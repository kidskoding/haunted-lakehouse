import { describe, expect, it } from "vitest";
import { rngFor } from "./random";
import { humanSeed, isHumanSeed } from "./seed";

function seedFor(i: number): string {
  return humanSeed(rngFor(["seed-test", "x", i]));
}

describe("humanSeed", () => {
  it("reads as omen-treat-number", () => {
    expect(seedFor(0)).toMatch(/^[a-z]+-[a-z]+-[1-9][0-9]?$/);
  });

  it("is stable across releases", () => {
    // Pinned: seeds are shared and replayed, so the same stream must always name the same seed.
    expect([0, 1, 2, 3, 4].map(seedFor)).toEqual([
      "ember-truffle-55",
      "shade-acorn-30",
      "specter-bonfire-76",
      "moon-acorn-24",
      "coffin-nutmeg-72",
    ]);
  });

  it("varies with the stream it draws from", () => {
    const seeds = new Set(Array.from({ length: 1000 }, (_, i) => seedFor(i)));
    // 32 x 32 x 99 = 101,376 seeds, so 1000 draws expect about 5 birthday collisions; the
    // bound leaves room for chance while still catching a stream that repeats itself.
    expect(seeds.size).toBeGreaterThan(960);
  });

  it("only produces seeds that validate, with numbers from 1 to 99", () => {
    const numbers = new Set<number>();
    for (let i = 0; i < 5000; i++) {
      const seed = seedFor(i);
      expect(isHumanSeed(seed)).toBe(true);
      numbers.add(Number(seed.split("-")[2]));
    }
    expect(Math.min(...numbers)).toBe(1);
    expect(Math.max(...numbers)).toBe(99);
  });
});

describe("isHumanSeed", () => {
  it.each(["raven-pumpkin-13", "wisp-candycorn-1", "ash-apple-99"])("accepts %s", (seed) => {
    expect(isHumanSeed(seed)).toBe(true);
  });

  it.each([
    "",
    "raven-pumpkin",
    "raven-pumpkin-0",
    "raven-pumpkin-100",
    "raven-pumpkin-013",
    "Raven-pumpkin-13",
    "pumpkin-raven-13",
    "zombie-pumpkin-13",
    "raven-pumpkin-13 ",
  ])("rejects %j", (seed) => {
    expect(isHumanSeed(seed)).toBe(false);
  });
});
