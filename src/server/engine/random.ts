import "server-only";

/** A deterministic random stream. Every draw advances it. */
export interface Rng {
  /** A float in [0, 1). */
  float(): number;
  /** An integer in [min, max). */
  int(min: number, max: number): number;
  /** One element of a non-empty list. */
  pick<T>(items: readonly T[]): T;
}

/** The parts that identify one stream: always the puzzle, run seed, and slot, then any sub-stream labels. */
export type SeedKey = readonly [
  puzzleId: string,
  runSeed: string,
  slot: number,
  ...rest: (string | number)[],
];

/**
 * cyrb128: a fast, well-mixed 128-bit string hash, used only to expand a key into the
 * PRNG's 128-bit state. Not cryptographic, and it doesn't need to be.
 */
function cyrb128(input: string): [number, number, number, number] {
  let h1 = 1779033703;
  let h2 = 3144134277;
  let h3 = 1013904242;
  let h4 = 2773480762;
  for (let i = 0; i < input.length; i++) {
    const k = input.charCodeAt(i);
    h1 = h2 ^ Math.imul(h1 ^ k, 597399067);
    h2 = h3 ^ Math.imul(h2 ^ k, 2869860233);
    h3 = h4 ^ Math.imul(h3 ^ k, 951274213);
    h4 = h1 ^ Math.imul(h4 ^ k, 2716044179);
  }
  h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067);
  h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233);
  h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213);
  h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179);
  h1 ^= h2 ^ h3 ^ h4;
  h2 ^= h1;
  h3 ^= h1;
  h4 ^= h1;
  return [h1 >>> 0, h2 >>> 0, h3 >>> 0, h4 >>> 0];
}

/** sfc32 (Small Fast Counting): a 128-bit-state PRNG that passes PractRand, returning uint32s. */
function sfc32(seed: [number, number, number, number]): () => number {
  let [a, b, c, d] = seed;
  return () => {
    a |= 0;
    b |= 0;
    c |= 0;
    d |= 0;
    const t = (((a + b) | 0) + d) | 0;
    d = (d + 1) | 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) | 0;
    c = (c << 21) | (c >>> 11);
    c = (c + t) | 0;
    return t >>> 0;
  };
}

// The counter starts at the hash's last word, so the first few outputs still correlate with
// the seed; discarding them is the reference implementation's recommended warm-up.
const WARM_UP_DRAWS = 15;

const UINT32_RANGE = 2 ** 32;

/**
 * The stream for one key. The key is JSON-encoded before hashing, so its parts can never run
 * together: `["a-b", "c"]` and `["a", "b-c"]` are different streams.
 */
export function rngFor(key: SeedKey): Rng {
  const next = sfc32(cyrb128(JSON.stringify(key)));
  for (let i = 0; i < WARM_UP_DRAWS; i++) next();

  const float = () => next() / UINT32_RANGE;
  return {
    float,
    int(min, max) {
      // One uint32 draw can tell apart at most 2^32 values.
      if (!Number.isSafeInteger(min) || !Number.isSafeInteger(max) || max <= min) {
        throw new RangeError(
          `int() needs integers with min < max, got [${String(min)}, ${String(max)}).`,
        );
      }
      if (max - min > UINT32_RANGE) {
        throw new RangeError("int() covers at most 2^32 values.");
      }
      return min + Math.floor(float() * (max - min));
    },
    pick<T>(items: readonly T[]): T {
      if (items.length === 0) throw new RangeError("pick() needs at least one item.");
      // The index is in bounds, so the element exists even when T itself admits undefined.
      return items[Math.floor(float() * items.length)] as T;
    },
  };
}
