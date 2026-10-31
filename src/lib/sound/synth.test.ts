import { describe, expect, it } from "vitest";
import {
  AMBIENT_LOOP_SECONDS,
  AMBIENT_SEED,
  PEAK,
  STINGS,
  ambientEvents,
  mulberry32,
  renderAmbient,
  renderSting,
} from "./synth";

// Low enough to keep the suite fast; the synthesis is rate-independent.
const RATE = 8000;

function peak(samples: Float32Array): number {
  let max = 0;
  for (const sample of samples) max = Math.max(max, Math.abs(sample));
  return max;
}

describe("mulberry32", () => {
  it("repeats for a seed and differs across seeds", () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    const c = mulberry32(43);
    const first = [a(), a(), a()];
    expect([b(), b(), b()]).toEqual(first);
    expect([c(), c(), c()]).not.toEqual(first);
    for (const value of first) {
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });
});

describe("ambient night", () => {
  it("places the same crickets and owls for the same seed", () => {
    expect(ambientEvents(AMBIENT_SEED)).toEqual(ambientEvents(AMBIENT_SEED));
    expect(ambientEvents(AMBIENT_SEED + 1)).not.toEqual(ambientEvents(AMBIENT_SEED));
  });

  it("keeps every event clear of the loop seam and is sparse", () => {
    const events = ambientEvents(AMBIENT_SEED);
    expect(events.filter((event) => event.kind === "owl").length).toBeLessThanOrEqual(2);
    expect(events.length).toBeLessThanOrEqual(10);
    for (const event of events) {
      expect(event.at).toBeGreaterThan(1);
      expect(event.at).toBeLessThan(AMBIENT_LOOP_SECONDS - 2);
    }
  });

  it("renders identically for a seed and differently for another", () => {
    const a = renderAmbient(RATE);
    expect(renderAmbient(RATE)).toEqual(a);
    expect(renderAmbient(RATE, AMBIENT_SEED + 1)).not.toEqual(a);
    expect(a.length).toBe(AMBIENT_LOOP_SECONDS * RATE);
    expect(peak(a)).toBeCloseTo(PEAK.ambient, 5);
  });

  it("loops without a click: the wrap is no bigger than any other step", () => {
    const a = renderAmbient(RATE);
    let largestStep = 0;
    for (let i = 1; i < a.length; i += 1) {
      largestStep = Math.max(largestStep, Math.abs((a[i] ?? 0) - (a[i - 1] ?? 0)));
    }
    const wrap = Math.abs((a[0] ?? 0) - (a[a.length - 1] ?? 0));
    expect(wrap).toBeLessThanOrEqual(largestStep);
    expect(wrap).toBeLessThan(0.01);
  });
});

describe("stings", () => {
  it.each(STINGS)("%s renders deterministically, normalized, and decays to silence", (sting) => {
    const a = renderSting(sting, RATE);
    expect(renderSting(sting, RATE)).toEqual(a);
    expect(peak(a)).toBeCloseTo(PEAK.sting, 5);
    expect(peak(a.subarray(a.length - RATE / 10))).toBeLessThan(0.05);
  });

  it("are distinct sounds of rising length", () => {
    const [candle, cleared, death] = STINGS.map((sting) => renderSting(sting, RATE));
    expect(candle?.length).toBeLessThan(cleared?.length ?? 0);
    expect(cleared?.length).toBeLessThan(death?.length ?? 0);
  });
});
