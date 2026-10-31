import { describe, expect, it } from "vitest";
import { PAGE_IDS } from "../narrative/progress";
import {
  awardsAfterReduce,
  awardsForBossClear,
  applyAwards,
  charactersFrom,
  FRESH_UNLOCKS,
  isCharacterUnlocked,
  runConfigFor,
  storyProgressFrom,
  unlockedActsFrom,
} from "./progress";
import type { RunState } from "../engine/run/types";

function baseState(over: Partial<RunState> = {}): RunState {
  return {
    seed: "raven-pumpkin-13",
    character: "intern",
    unlockedActs: 1,
    status: "playing",
    phase: "in-hour",
    candles: 4,
    tableMaterialization: true,
    slot: 3,
    hour: null,
    history: [],
    relics: [],
    offer: null,
    actReached: 1,
    lastEnding: null,
    ...over,
  };
}

describe("unlockedActsFrom", () => {
  it("starts at act I with no rows", () => {
    expect(unlockedActsFrom([])).toBe(1);
  });

  it("reads the highest act key", () => {
    expect(unlockedActsFrom(["act-2"])).toBe(2);
    expect(unlockedActsFrom(["act-3", "act-2"])).toBe(3);
    expect(unlockedActsFrom(["act-2", "garbage"])).toBe(2);
  });
});

describe("charactersFrom", () => {
  it("always includes the Intern", () => {
    expect(charactersFrom([])).toEqual(["intern"]);
  });

  it("adds unlocked companions in catalog order", () => {
    expect(charactersFrom(["old_wren", "night_clerk"])).toEqual([
      "intern",
      "night_clerk",
      "old_wren",
    ]);
  });
});

describe("runConfigFor", () => {
  it("refuses a locked character", () => {
    expect(runConfigFor(FRESH_UNLOCKS, "seed", "purist")).toBeNull();
  });

  it("opens a run at the player's act ceiling", () => {
    const unlocks = applyAwards(FRESH_UNLOCKS, [
      { kind: "act", key: "act-2" },
      { kind: "character", key: "night_clerk" },
    ]);
    expect(runConfigFor(unlocks, "raven-pumpkin-13", "night_clerk")).toEqual({
      seed: "raven-pumpkin-13",
      character: "night_clerk",
      unlockedActs: 2,
    });
  });
});

describe("awardsForBossClear", () => {
  it("opens Act II and the Night Clerk on the Act I ending", () => {
    expect(awardsForBossClear("act-1", [])).toEqual([
      { kind: "ending", key: "act-1" },
      { kind: "act", key: "act-2" },
      { kind: "character", key: "night_clerk" },
    ]);
  });

  it("opens Act III and the Purist on the Act II ending", () => {
    expect(awardsForBossClear("act-2", [])).toEqual([
      { kind: "ending", key: "act-2" },
      { kind: "act", key: "act-3" },
      { kind: "character", key: "purist" },
    ]);
  });

  it("records the Séance ending when pages are still missing", () => {
    expect(awardsForBossClear("act-3", ["page-1"])).toEqual([{ kind: "ending", key: "act-3" }]);
  });

  it("grants the true ending and Old Wren when every page is held", () => {
    expect(awardsForBossClear("act-3", [...PAGE_IDS])).toEqual([
      { kind: "ending", key: "true" },
      { kind: "character", key: "old_wren" },
    ]);
  });
});

describe("awardsAfterReduce", () => {
  it("fires only when lastEnding newly appears", () => {
    const before = baseState({ lastEnding: null });
    const after = baseState({ lastEnding: "act-1", status: "won-act", phase: "ended" });
    expect(awardsAfterReduce(before, after, [])).toHaveLength(3);
    expect(awardsAfterReduce(after, after, [])).toEqual([]);
  });
});

describe("applyAwards and storyProgressFrom", () => {
  it("merges awards and pages without duplicates", () => {
    const once = applyAwards(FRESH_UNLOCKS, awardsForBossClear("act-1", []), ["page-2"]);
    const twice = applyAwards(once, awardsForBossClear("act-1", []), ["page-2", "page-1"]);
    expect(twice.unlockedActs).toBe(2);
    expect(isCharacterUnlocked("night_clerk", twice)).toBe(true);
    expect(twice.fragments).toEqual(["page-1", "page-2"]);
    expect(storyProgressFrom(twice)).toEqual({
      runsFinished: 0,
      endingsSeen: ["act-1"],
      pagesHeld: ["page-1", "page-2"],
    });
  });
});
