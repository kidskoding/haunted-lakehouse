import { describe, expect, it } from "vitest";
import { open, reach, start } from "../testing/night-run";
import { curseAddsRelic, RELICS } from "./relics";

describe("curseAddsRelic", () => {
  it("promises one more relic for clearing a cursed hour", () => {
    expect(curseAddsRelic(open(reach(2), "fog"))).toBe(true);
  });

  it("promises nothing for a clear hour or before an hour opens", () => {
    expect(curseAddsRelic(open(reach(2)))).toBe(false);
    expect(curseAddsRelic(start())).toBe(false);
  });

  it("promises nothing to Old Wren, who is never offered relics", () => {
    expect(curseAddsRelic(open(reach(2, { character: "old_wren" }), "darkness"))).toBe(false);
  });

  it("promises nothing at a boss whose clear ends the run", () => {
    expect(curseAddsRelic(open(reach(3, { unlockedActs: 1 }), "fog"))).toBe(false);
    expect(curseAddsRelic(open(reach(3, { unlockedActs: 2 }), "fog"))).toBe(true);
    expect(curseAddsRelic(open(reach(10), "fog"))).toBe(false);
  });

  it("promises nothing when every relic left is already on offer", () => {
    // Holding all but the Spare Candle leaves two offerable relics: the base offer already.
    const held = RELICS.filter((relic) => relic !== "spare-candle" && relic !== "hourglass");
    expect(curseAddsRelic(open({ ...reach(2), relics: held }, "fog"))).toBe(false);
  });
});
