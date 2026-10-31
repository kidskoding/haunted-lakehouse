import { describe, expect, it } from "vitest";
import { townRng, weighted } from "./town";

describe("weighted", () => {
  it("follows the weights and never picks a zero-weight option", () => {
    const rng = townRng("raven-pumpkin-13", "weights");
    const counts = { a: 0, b: 0, never: 0 };
    for (let i = 0; i < 30_000; i++) {
      counts[
        weighted(rng, [
          ["a", 1],
          ["b", 2],
          ["never", 0],
        ] as const)
      ]++;
    }
    expect(counts.never).toBe(0);
    expect(counts.b / counts.a).toBeGreaterThan(1.9);
    expect(counts.b / counts.a).toBeLessThan(2.1);
  });

  it("refuses an empty list", () => {
    expect(() => weighted(townRng("x", "y"), [])).toThrow(RangeError);
  });
});

describe("townRng", () => {
  it("keys the town by run seed and label only", () => {
    expect(townRng("s", "houses").float()).toBe(townRng("s", "houses").float());
    expect(townRng("s", "houses").float()).not.toBe(townRng("s", "kids").float());
  });
});
