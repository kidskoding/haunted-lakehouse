import "server-only";
import type { Rng } from "../random";

/** How a burn ended: the wax ran out, the wind took it, or it was still lit when the night ended. */
export type BurnEnding = "burned-out" | "blown-out" | "still-lit";

/** One candle's flame, from lighting to going dark. Times are seconds into the night. */
export interface CandleBurn {
  readonly litAt: number;
  /** When the flame went out, or the end of the night if it was still lit. */
  readonly outAt: number;
  readonly ending: BurnEnding;
  /** The steady flame brightness this candle starts at, before flicker and decay. */
  readonly peakLux: number;
  /** How long the wax would have lasted had nothing interrupted it. */
  readonly naturalLife: number;
}

const MINUTE = 60;

// A pumpkin tea light or votive lasts three to seven hours depending on size and draft.
const MIN_LIFE = 180 * MINUTE;
const MAX_LIFE = 420 * MINUTE;

const LATE_LIGHTING = 0.25;
const WIND_CHANCE = 0.08;
// Someone notices a dark pumpkin and puts in a fresh candle; far likelier after a gust than
// after a candle that burned all evening.
const RELIGHT_AFTER_WIND = 0.6;
const RELIGHT_AFTER_BURN_OUT = 0.12;

function naturalBurn(rng: Rng, litAt: number, nightLength: number): CandleBurn {
  const naturalLife = rng.int(MIN_LIFE, MAX_LIFE + 1);
  const peakLux = 28 + rng.float() * 24;
  const naturalEnd = litAt + naturalLife;
  return naturalEnd >= nightLength
    ? { litAt, outAt: nightLength, ending: "still-lit", peakLux, naturalLife }
    : { litAt, outAt: naturalEnd, ending: "burned-out", peakLux, naturalLife };
}

/**
 * The burns of one pumpkin's candle over the night: usually one, sometimes cut short by the
 * wind, and sometimes followed by a fresh candle after a dark gap.
 */
export function planBurns(rng: Rng, nightLength: number): CandleBurn[] {
  // Most porches light up as trick-or-treating starts; stragglers light theirs later.
  const litAt =
    rng.float() < LATE_LIGHTING ? rng.int(30 * MINUTE, 120 * MINUTE) : rng.int(0, 30 * MINUTE);
  let first = naturalBurn(rng, litAt, nightLength);
  const windAt = litAt + rng.int(20 * MINUTE, 150 * MINUTE);
  if (rng.float() < WIND_CHANCE && windAt < first.outAt) {
    first = { ...first, outAt: windAt, ending: "blown-out" };
  }
  if (first.ending === "still-lit") return [first];

  const relightChance = first.ending === "blown-out" ? RELIGHT_AFTER_WIND : RELIGHT_AFTER_BURN_OUT;
  const relitAt = first.outAt + rng.int(10 * MINUTE, 46 * MINUTE);
  if (rng.float() >= relightChance || relitAt >= nightLength) return [first];
  return [first, naturalBurn(rng, relitAt, nightLength)];
}

// The last stretch of a candle's natural life, when the wick drowns in wax and the flame
// gutters: it sinks and swings far more than it did all evening.
const GUTTER = 20 * MINUTE;
// The mean flame dims slowly as the wick sinks into the pumpkin.
const DECAY = 0.3;
const STEADY_FLICKER = 0.07;
const GUTTER_FLICKER = 0.35;
const GUST_CHANCE = 0.02;
// A lit flame never reads zero, so a zero always means the candle is out.
const MIN_LIT_LUX = 0.5;

/** Roughly standard-normal noise: the sum of three uniforms has variance 1/4. */
function noise(rng: Rng): number {
  return (rng.float() + rng.float() + rng.float() - 1.5) * 2;
}

/**
 * A reader for one burn's flame, called in time order: flicker around a slowly decaying mean,
 * gusts that dip sharply and recover over a few readings, and guttering before the wax runs out.
 */
export function flameReader(rng: Rng, burn: CandleBurn): (t: number) => number {
  let gust = 0;
  return (t) => {
    const age = t - burn.litAt;
    const mean = burn.peakLux * (1 - DECAY * (age / burn.naturalLife));
    const toEnd = burn.naturalLife - age;
    const guttering = toEnd < GUTTER ? 1 - toEnd / GUTTER : 0;
    const flicker = STEADY_FLICKER + (GUTTER_FLICKER - STEADY_FLICKER) * guttering;

    gust = rng.float() < GUST_CHANCE ? 0.3 + rng.float() * 0.4 : gust / 2;
    const lux = mean * (1 - 0.65 * guttering) * (1 + flicker * noise(rng)) * (1 - gust);
    return Math.round(Math.max(lux, MIN_LIT_LUX) * 10) / 10;
  };
}
