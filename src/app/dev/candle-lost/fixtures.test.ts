import { describe, expect, it } from "vitest";
import { candleLostSpecimens } from "./fixtures";

describe("the candle-lost gallery", () => {
  const specimens = candleLostSpecimens();
  const byId = (id: string) => {
    const found = specimens.find((specimen) => specimen.id === id);
    if (!found) throw new Error(`No specimen ${id}.`);
    return found;
  };

  it("reveals a hidden batch everywhere but the already-visible break", () => {
    expect(specimens.map(({ id, alreadyVisible }) => [id, alreadyVisible])).toEqual([
      ["hour", false],
      ["boss", false],
      ["error", false],
      ["visible", true],
    ]);
  });

  it("costs two candles only on the boss", () => {
    expect(byId("boss").candles).toEqual({ lit: 1, lost: 2, total: 3 });
    expect(byId("hour").candles).toEqual({ lit: 2, lost: 1, total: 3 });
  });

  it("has Wren mark the last candle after the boss", () => {
    const wren = byId("boss").reaction.at(-1);
    expect(wren?.speaker).toBe("wren");
    expect(wren?.segments.map((segment) => segment.text).join("")).toMatch(/^One left\./);
  });

  it("gives every specimen a reaction from the hour's cast", () => {
    for (const specimen of specimens) expect(specimen.reaction.length).toBeGreaterThan(0);
  });
});
