import { easeInOut } from "../motion";

/**
 * Art direction §2 colors this scene uses. Local until the design tokens land, so the scene
 * layer does not depend on them yet.
 */
export const palette = {
  dial: "#172034",
  dialRim: "#3B4A6B",
  tick: "#5C5A57",
  wax: "#EDE3CF",
  waxShade: "#B8AE9C",
  wick: "#5C5A57",
  flame: "#F2A746",
  ember: "#D9822B",
  glow: "#FFD58F",
} as const;

/** The scene is drawn in this fixed design space and scaled to fit its container. */
export const DESIGN_WIDTH = 320;
export const DESIGN_HEIGHT = 180;

/** The night opens at 6pm. */
export const START_HOUR = 6;
/** `dur.ceremony`: the hand's sweep from one hour to the next. */
export const SWEEP_MS = 1600;
/** How long the hand rests on each hour before the next sweep. */
export const REST_MS = 1400;

/** Flicker amplitude by flame state (motion tokens: idle 0.15, guttering 0.45). */
export const FLICKER_AMPLITUDE = { idle: 0.15, guttering: 0.45 } as const;
/** A guttering flame leans, in radians of skew. */
export const GUTTER_LEAN = 0.18;

export type FlameState = keyof typeof FLICKER_AMPLITUDE;

export interface CandleClockProps {
  readonly flame: FlameState;
  /**
   * Pins the hand to this hour on the 12-hour dial (7.25 is 7:15), sweeping to each new one,
   * for a clock that follows the night. Absent, the hand walks hour to hour on its own.
   */
  readonly hour?: number;
}

/**
 * Where the clock hand points at a moment in scene time, in hours on a 12-hour dial. It
 * rests on an hour, then sweeps to the next with `ease.inout`.
 */
export function clockHandHour(timeMs: number): number {
  const period = SWEEP_MS + REST_MS;
  const step = Math.floor(timeMs / period);
  const within = timeMs - step * period;
  const progress = within < REST_MS ? 0 : easeInOut((within - REST_MS) / SWEEP_MS);
  return (START_HOUR + step + progress) % 12;
}

/**
 * The hour the hand should sweep to from `from` so it takes the short way round the dial:
 * forward from 11:50 to 12:10, and back when the clocks fall back from 1:59 to 1:00.
 */
export function sweepTarget(from: number, to: number): number {
  const delta = ((((to - from) % 12) + 18) % 12) - 6;
  return from + delta;
}
