/**
 * Builds a CSS-style `cubic-bezier(x1, y1, x2, y2)` easing, so scenes move on the same
 * curves as the DOM's motion tokens.
 */
export function cubicBezier(x1: number, y1: number, x2: number, y2: number): (t: number) => number {
  const cx = 3 * x1;
  const bx = 3 * (x2 - x1) - cx;
  const ax = 1 - cx - bx;
  const cy = 3 * y1;
  const by = 3 * (y2 - y1) - cy;
  const ay = 1 - cy - by;
  const sampleX = (s: number) => ((ax * s + bx) * s + cx) * s;
  const sampleY = (s: number) => ((ay * s + by) * s + cy) * s;
  const slopeX = (s: number) => (3 * ax * s + 2 * bx) * s + cx;

  return (t) => {
    if (t <= 0) return 0;
    if (t >= 1) return 1;
    // Newton's method converges in a few steps for the gentle curves we use; bisection
    // backs it up where the slope flattens out.
    let s = t;
    for (let i = 0; i < 8; i += 1) {
      const error = sampleX(s) - t;
      if (Math.abs(error) < 1e-6) return sampleY(s);
      const slope = slopeX(s);
      if (Math.abs(slope) < 1e-6) break;
      s -= error / slope;
    }
    let lo = 0;
    let hi = 1;
    s = t;
    for (let i = 0; i < 32; i += 1) {
      const x = sampleX(s);
      if (Math.abs(x - t) < 1e-6) break;
      if (x < t) lo = s;
      else hi = s;
      s = (lo + hi) / 2;
    }
    return sampleY(s);
  };
}

/** `ease.inout` from the motion tokens: the clock hand, fades, light swells. */
export const easeInOut = cubicBezier(0.65, 0, 0.35, 1);

/** Hashes a lattice point to a value in [-1, 1], stable for a given seed. */
function latticeValue(seed: number, index: number): number {
  let h = (seed | 0) ^ Math.imul(index | 0, 0x9e3779b1);
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  h ^= h >>> 16;
  return ((h >>> 0) / 0xffffffff) * 2 - 1;
}

/**
 * Seeded 1D value noise for flames: a smooth wander in [-1, 1] at about `frequencyHz`.
 * Seeded rather than random so screenshots and end-to-end runs are reproducible.
 */
export function createFlicker(seed: number, frequencyHz = 7.5): (timeMs: number) => number {
  return (timeMs) => {
    const x = (timeMs / 1000) * frequencyHz;
    const index = Math.floor(x);
    const f = x - index;
    const u = f * f * (3 - 2 * f);
    const a = latticeValue(seed, index);
    const b = latticeValue(seed, index + 1);
    return a + (b - a) * u;
  };
}
