import { describe, expect, it } from "vitest";
import type { Voice } from "./bindings";
import { mayor, wren } from "./lines";
import {
  NarrativeError,
  plainText,
  renderLine,
  renderTemplate,
  type RenderContext,
} from "./render";

const INTERN: Voice = { character: "intern", stage: "W0" };
const clear = (bindings: RenderContext["bindings"]): RenderContext => ({ bindings, withheld: [] });

describe("renderTemplate", () => {
  it("fills placeholders and marks them as values", () => {
    const segments = renderTemplate("{n|plural:house,houses} lit at {t|clock}.", {
      bindings: { n: 1204, t: "19:00" },
      withheld: [],
    });
    expect(plainText(segments)).toBe("1,204 houses lit at 7:00pm.");
    expect(segments.filter((s) => s.kind === "value").map((s) => s.text)).toEqual([
      "1,204 houses",
      "7:00pm",
    ]);
  });

  it("prints a bare number with grouping and a bare string as itself", () => {
    expect(plainText(renderTemplate("{n} on {s}", clear({ n: 4012, s: "Cobweb Court" })))).toBe(
      "4,012 on Cobweb Court",
    );
  });

  it("throws on a placeholder nothing is bound to", () => {
    expect(() => renderTemplate("At {checkpoint}.", clear({}))).toThrow(NarrativeError);
    expect(() => renderTemplate("At {checkpoint}.", clear({}))).toThrow(/checkpoint/);
  });

  it("throws when a value has the wrong type for its format", () => {
    expect(() => renderTemplate("{n|plural:a,b}", clear({ n: "seven" }))).toThrow(/number/);
    expect(() => renderTemplate("{t|clock}", clear({ t: 1900 }))).toThrow(/time/);
  });

  it("renders a withheld binding as fog instead of failing", () => {
    const segments = renderTemplate("The Mayor's says {mayor_active}. At {t|clock}.", {
      bindings: {},
      withheld: ["mayor_active", "t"],
    });
    expect(plainText(segments)).toBe(
      "The Mayor's says a number lost in the fog. At a time lost in the fog.",
    );
    expect(segments.filter((s) => s.kind === "fog").map((s) => s.key)).toEqual([
      "mayor_active",
      "t",
    ]);
  });

  it("fogs a withheld key even if a value slipped through", () => {
    const text = plainText(renderTemplate("{n}", { bindings: { n: 3 }, withheld: ["n"] }));
    expect(text).toBe("a number lost in the fog");
  });

  it("still throws for a missing key the fog didn't take", () => {
    expect(() => renderTemplate("{a} {b}", { bindings: {}, withheld: ["a"] })).toThrow(/\{b\}/);
  });
});

describe("renderLine", () => {
  const symptomatic = mayor("I said {*shown_value}. It was not.", "I said a number. It was not.");

  it("shows a line's fog version when the fog took one of its symptoms", () => {
    const line = renderLine(symptomatic, { bindings: {}, withheld: ["shown_value"] }, INTERN);
    expect(plainText(line.segments)).toBe("I said a number. It was not.");
  });

  it("shows the line itself when its symptoms are clear", () => {
    const line = renderLine(symptomatic, clear({ shown_value: 412 }), INTERN);
    expect(plainText(line.segments)).toBe("I said 412. It was not.");
  });

  it("binds {you} by speaker and character", () => {
    const hello = (speaker: typeof mayor, voice: Voice) =>
      plainText(renderLine(speaker("Hello, {you}."), clear({}), voice).segments);
    expect(hello(mayor, INTERN)).toBe("Hello, new hire.");
    expect(hello(wren, INTERN)).toBe("Hello, kid.");
    expect(hello(wren, { character: "purist", stage: "W2" })).toBe("Hello, consultant.");
    expect(hello(wren, { character: "purist", stage: "W3" })).toBe("Hello, Purist.");
    expect(hello(mayor, { character: "purist", stage: "W3" })).toBe("Hello, Consultant.");
  });

  it("turns Wren's lines into thoughts when the player is Old Wren", () => {
    const voice: Voice = { character: "old_wren", stage: "OW" };
    expect(renderLine(wren("Sloppy."), clear({}), voice).thought).toBe(true);
    expect(renderLine(mayor("Wren."), clear({}), voice).thought).toBe(false);
    expect(renderLine(wren("Sloppy."), clear({}), INTERN).thought).toBe(false);
  });
});
