import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { colors, durations, easings, reducedDurations } from "./tokens";

type Duration = keyof typeof durations;

const css = readFileSync(new URL("../../app/tokens.css", import.meta.url), "utf8");

/** The body of the first block whose opening matches `opening`; token blocks never nest. */
function block(opening: RegExp): string {
  const match = new RegExp(`${opening.source}\\s*\\{([^{}]*)\\}`).exec(css);
  if (!match?.[1]) throw new Error(`tokens.css has no block matching ${opening.source}`);
  return match[1].trim();
}

/** Declarations `--<prefix><name>: <value>;` in a CSS fragment, as a name-to-value map. */
function declarations(fragment: string, prefix: string): Map<string, string> {
  const found = new Map<string, string>();
  const pattern = new RegExp(`--${prefix}([a-z0-9-]+):\\s*([^;]+);`, "g");
  for (const [, name, value] of fragment.matchAll(pattern)) {
    if (name && value) found.set(name, value.trim());
  }
  return found;
}

function bezier(points: readonly number[]): string {
  return `cubic-bezier(${points.join(", ")})`;
}

const theme = block(/@theme static/);
const forcedReduce = block(/:root\[data-motion="reduce"\]/);
const osReduce = block(/:root:not\(\[data-motion="full"\]\)/);

describe("design tokens", () => {
  it("mirrors every CSS color, and only those, in the script tokens", () => {
    expect(Object.fromEntries(declarations(theme, "color-"))).toEqual(colors);
  });

  it("mirrors the motion durations", () => {
    const fromCss = [...declarations(theme, "transition-duration-")].map(
      ([name, value]) => [name, Number.parseInt(value, 10)] as const,
    );
    expect(Object.fromEntries(fromCss)).toEqual(durations);
  });

  it("mirrors the easing curves", () => {
    const expected = Object.entries(easings).map(([name, points]) => [name, bezier(points)]);
    expect(Object.fromEntries(declarations(theme, "ease-"))).toEqual(Object.fromEntries(expected));
  });

  it("reduces motion the same way for the OS preference and the in-game setting", () => {
    expect(declarations(osReduce, "")).toEqual(declarations(forcedReduce, ""));
  });

  it("collapses exactly the durations the script tokens collapse, and drops the overshoot", () => {
    const overridden = declarations(forcedReduce, "transition-duration-");
    const changed = (Object.keys(durations) as Duration[]).filter(
      (name) => reducedDurations[name] !== durations[name],
    );
    expect([...overridden.keys()].sort()).toEqual(changed.sort());
    for (const [name, value] of overridden) {
      expect(Number.parseInt(value, 10)).toBe(reducedDurations[name as Duration]);
    }
    expect(declarations(forcedReduce, "ease-").get("settle")).toBe(bezier(easings.out));
  });
});
