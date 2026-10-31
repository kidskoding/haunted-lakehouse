import { describe, expect, it } from "vitest";
import { cryptCountsFrom } from "./crypt";
import { FRESH_UNLOCKS } from "./progress";

describe("cryptCountsFrom", () => {
  it("gives a new player the Intern and no pages", () => {
    expect(cryptCountsFrom(FRESH_UNLOCKS)).toEqual({
      characters: { held: 1, total: 4 },
      pages: { held: 0, total: 7 },
    });
  });

  it("counts unlocked characters and held pages", () => {
    expect(
      cryptCountsFrom({
        ...FRESH_UNLOCKS,
        characters: ["intern", "night_clerk"],
        fragments: ["page-1", "page-4", "page-6"],
      }),
    ).toEqual({ characters: { held: 2, total: 4 }, pages: { held: 3, total: 7 } });
  });
});
