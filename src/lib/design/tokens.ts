/*
 * Script-side mirror of the design tokens in src/app/tokens.css, for code that cannot read
 * Tailwind classes: the scene layer's canvas colors and timed animations. Keys match the
 * Tailwind names (`colors.night` is `bg-night`). tokens.test.ts fails if the two drift.
 */

/** Every palette color, keyed by its Tailwind name. */
export const colors = {
  void: "#05070c",
  night: "#0a0e18",
  panel: "#101624",
  raised: "#172034",
  inset: "#070a12",
  fog: "#232b40",
  "tint-flame": "#2a2010",
  "tint-snuffed": "#2a1410",
  "tint-tallow": "#2a2410",
  "tint-moon": "#101c30",
  "tint-hollow": "#13220f",
  parchment: "#ede3cf",
  ash: "#b8ae9c",
  smoke: "#979083",
  faint: "#5c5a57",
  flame: "#f2a746",
  ember: "#d9822b",
  glow: "#ffd58f",
  snuffed: "#ef6a55",
  tallow: "#e6cb72",
  moon: "#93b6ea",
  hollow: "#a6d65e",
  "hollow-dim": "#5f8a3b",
  "line-faint": "#2a3550",
  "line-strong": "#3b4a6b",
  "line-control": "#5e6e94",
  "syn-keyword": "#f2a746",
  "syn-function": "#ffd58f",
  "syn-identifier": "#ede3cf",
  "syn-table": "#93b6ea",
  "syn-string": "#cdbe8e",
  "syn-number": "#dda48c",
  "syn-comment": "#8f8a7e",
  "syn-operator": "#b8ae9c",
  "syn-error": "#ef6a55",
  selection: "rgb(242 167 70 / 0.22)",
} as const;

export type ColorToken = keyof typeof colors;

/** Motion durations in milliseconds, at full motion. */
export const durations = {
  instant: 80,
  fast: 140,
  base: 220,
  slow: 420,
  scene: 900,
  ceremony: 1600,
} as const;

/**
 * Durations under reduced motion: anything longer than `base` becomes a `base` crossfade.
 * Matches the reduced-motion overrides in tokens.css.
 */
export const reducedDurations = {
  ...durations,
  slow: durations.base,
  scene: durations.base,
  ceremony: durations.base,
} as const;

/** Cubic-bézier control points `[x1, y1, x2, y2]`, keyed by the `ease-*` name. */
export const easings = {
  out: [0.22, 1, 0.36, 1],
  in: [0.55, 0, 1, 0.45],
  inout: [0.65, 0, 0.35, 1],
  settle: [0.34, 1.36, 0.64, 1],
} as const;
