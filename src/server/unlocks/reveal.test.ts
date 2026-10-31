import { describe, expect, it } from "vitest";
import { PAGE_IDS } from "../narrative/progress";
import { awardsForBossClear } from "./progress";
import { endingReveal } from "./reveal";

describe("endingReveal", () => {
  it("opens Act II with the Night Clerk after the first Act I boss clear", () => {
    expect(endingReveal(awardsForBossClear("act-1", []))).toEqual({
      act: 2,
      characters: [
        {
          name: "The Night Clerk",
          candles: 3,
          rules: ["Picks from three relics after each hour."],
        },
      ],
    });
  });

  it("opens Act III with the Purist after the Act II boss", () => {
    expect(endingReveal(awardsForBossClear("act-2", []))).toMatchObject({
      act: 3,
      characters: [{ name: "The Purist" }],
    });
  });

  it("reveals nothing when nothing new was granted", () => {
    expect(endingReveal([])).toBeNull();
    // The Act III ending writes only its ending row: no act, no character.
    expect(endingReveal(awardsForBossClear("act-3", []))).toBeNull();
  });

  it("unlocks Old Wren with the true ending", () => {
    expect(endingReveal(awardsForBossClear("act-3", PAGE_IDS))).toEqual({
      act: null,
      characters: [{ name: "Old Wren", candles: 1, rules: ["No relics, ever."] }],
    });
  });
});
