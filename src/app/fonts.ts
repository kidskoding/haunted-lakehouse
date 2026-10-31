import { Atkinson_Hyperlegible_Next, Fraunces, JetBrains_Mono } from "next/font/google";

/*
 * All three families are self-hosted by next/font at build time, so the browser never calls
 * Google. `subsets` only controls preloading: the latin-ext faces still ship, behind their
 * unicode-range, and load only when a page needs them.
 */

/** Display and story face. The extra axes back the title, heading, and prose presets. */
export const fraunces = Fraunces({
  subsets: ["latin"],
  style: ["normal", "italic"],
  axes: ["opsz", "SOFT", "WONK"],
  display: "swap",
  variable: "--font-fraunces",
});

/** UI face. */
export const atkinson = Atkinson_Hyperlegible_Next({
  subsets: ["latin"],
  style: ["normal", "italic"],
  display: "swap",
  // next/font has no metrics for this family, so it cannot build a size-adjusted fallback.
  adjustFontFallback: false,
  variable: "--font-atkinson",
});

/** Code and data face. Not preloaded: no first screen shows code, so it stays off the critical path. */
export const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  style: ["normal", "italic"],
  display: "swap",
  preload: false,
  variable: "--font-jetbrains-mono",
});

/** Class names that define the three font variables; set once on `<html>`. */
export const fontVariables = [fraunces.variable, atkinson.variable, jetbrainsMono.variable].join(
  " ",
);
