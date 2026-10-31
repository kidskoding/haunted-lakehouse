import { describe, expect, it } from "vitest";
import { type ColorToken, colors } from "./tokens";

/** WCAG 2.x relative luminance of a `#rrggbb` color. */
function luminance(hex: string): number {
  const [r = 0, g = 0, b = 0] = [1, 3, 5]
    .map((start) => Number.parseInt(hex.slice(start, start + 2), 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const [high, low] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return ((high ?? 0) + 0.05) / ((low ?? 0) + 0.05);
}

const TEXT = 4.5;
const LARGE_OR_UI = 3;

/*
 * Every pair the art direction allows, with the bar it must clear: normal text (AA) or large
 * text and control boundaries (WCAG 1.4.3 large, 1.4.11). Forbidden pairs (`faint` anywhere,
 * `smoke` on `fog`, the decorative lines) are deliberately absent.
 */
const allowed: readonly (readonly [fg: ColorToken, bg: ColorToken, min: number])[] = [
  ...(["void", "night", "panel", "raised", "inset", "fog"] as const).flatMap((bg) => [
    ["parchment", bg, TEXT] as const,
    ["ash", bg, TEXT] as const,
  ]),
  ...(["tint-flame", "tint-snuffed", "tint-tallow", "tint-moon", "tint-hollow"] as const).map(
    (bg) => ["parchment", bg, TEXT] as const,
  ),
  ...(["void", "night", "panel", "raised", "inset"] as const).map(
    (bg) => ["smoke", bg, TEXT] as const,
  ),
  ...(["void", "night", "panel", "raised", "inset", "fog", "tint-flame"] as const).map(
    (bg) => ["flame", bg, TEXT] as const,
  ),
  ...(["night", "panel", "raised"] as const).map((bg) => ["ember", bg, TEXT] as const),
  // `glow` is also the focus ring, so it must hold on every surface a control can sit on.
  ...(["night", "panel", "raised", "inset", "fog"] as const).map(
    (bg) => ["glow", bg, TEXT] as const,
  ),
  ...(["void", "night", "panel", "raised", "tint-hollow"] as const).map(
    (bg) => ["hollow", bg, TEXT] as const,
  ),
  ...(["void", "night", "panel", "raised"] as const).map(
    (bg) => ["hollow-dim", bg, LARGE_OR_UI] as const,
  ),
  ...(["night", "panel", "raised", "inset", "tint-snuffed"] as const).map(
    (bg) => ["snuffed", bg, TEXT] as const,
  ),
  ...(["night", "panel", "raised", "tint-tallow"] as const).map(
    (bg) => ["tallow", bg, TEXT] as const,
  ),
  ...(["night", "panel", "raised", "inset", "tint-moon", "fog"] as const).map(
    (bg) => ["moon", bg, TEXT] as const,
  ),
  ...(
    [
      "syn-keyword",
      "syn-function",
      "syn-identifier",
      "syn-table",
      "syn-string",
      "syn-number",
      "syn-comment",
      "syn-operator",
      "syn-error",
    ] as const
  ).map((fg) => [fg, "inset", TEXT] as const),
  // Labels on filled buttons.
  ...(["flame", "ember", "glow", "snuffed", "parchment"] as const).map(
    (fill) => ["night", fill, TEXT] as const,
  ),
  ...(["night", "panel", "raised", "inset"] as const).map(
    (bg) => ["line-control", bg, LARGE_OR_UI] as const,
  ),
];

describe("palette contrast", () => {
  it.each(allowed)("%s on %s clears %s:1", (fg, bg, min) => {
    expect(contrast(colors[fg], colors[bg])).toBeGreaterThanOrEqual(min);
  });

  it("matches the art direction's published ratios", () => {
    expect(contrast(colors.parchment, colors.night)).toBeCloseTo(15.14, 2);
    expect(contrast(colors["line-control"], colors.raised)).toBeCloseTo(3.2, 2);
  });
});
