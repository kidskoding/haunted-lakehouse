import { describe, expect, it } from "vitest";
import { createFlicker, cubicBezier, easeInOut } from "./motion";

describe("cubicBezier", () => {
  it("pins the endpoints and clamps outside them", () => {
    expect(easeInOut(0)).toBe(0);
    expect(easeInOut(1)).toBe(1);
    expect(easeInOut(-0.5)).toBe(0);
    expect(easeInOut(2)).toBe(1);
  });

  it("is the identity for a linear curve", () => {
    const linear = cubicBezier(0, 0, 1, 1);
    for (const t of [0.1, 0.25, 0.5, 0.8]) expect(linear(t)).toBeCloseTo(t, 5);
  });

  it("matches ease.inout: symmetric, slow at the ends, and monotonic", () => {
    expect(easeInOut(0.5)).toBeCloseTo(0.5, 5);
    expect(easeInOut(0.2) + easeInOut(0.8)).toBeCloseTo(1, 5);
    expect(easeInOut(0.1)).toBeLessThan(0.05);
    let previous = 0;
    for (let i = 1; i <= 100; i += 1) {
      const value = easeInOut(i / 100);
      expect(value).toBeGreaterThanOrEqual(previous);
      previous = value;
    }
  });
});

describe("createFlicker", () => {
  const samples = (flicker: (timeMs: number) => number) =>
    Array.from({ length: 200 }, (_, i) => flicker(i * 7));

  it("is deterministic for a seed", () => {
    expect(samples(createFlicker(42))).toEqual(samples(createFlicker(42)));
  });

  it("differs between seeds", () => {
    expect(samples(createFlicker(42))).not.toEqual(samples(createFlicker(43)));
  });

  it("stays within [-1, 1] and actually wanders", () => {
    const values = samples(createFlicker(7));
    expect(Math.min(...values)).toBeGreaterThanOrEqual(-1);
    expect(Math.max(...values)).toBeLessThanOrEqual(1);
    expect(Math.max(...values) - Math.min(...values)).toBeGreaterThan(0.5);
  });

  it("is continuous, so the flame never jumps between frames", () => {
    const flicker = createFlicker(3);
    for (let t = 0; t < 2000; t += 1) {
      expect(Math.abs(flicker(t + 1) - flicker(t))).toBeLessThan(0.05);
    }
  });
});
