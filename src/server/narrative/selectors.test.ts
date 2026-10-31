import { describe, expect, it } from "vitest";
import type { Checkpoint } from "../engine/puzzle";
import { CURSES } from "../engine/run/curses";
import { RELICS } from "../engine/run/relics";
import type { Slot } from "../engine/slots";
import { runBindings, SHARED_BINDINGS, type Voice } from "./bindings";
import { ending, endingFor } from "./endings";
import { CURSE_FLAVOR, RELIC_FLAVOR } from "./flavor";
import { clearedScene, introScene } from "./hour";
import { narrativePack } from "./packs";
import { LEDGER_PAGES } from "./pages";
import { PAGE_IDS, type StoryProgress } from "./progress";
import {
  OWNER_LOST_CANDLE,
  WREN_BOSS_COST,
  WREN_ONE_LEFT,
  characterRunStart,
  lostCandleScene,
  type LostCandle,
} from "./reactions";
import { plainText, renderScene, renderTemplate } from "./render";
import { placeholdersOf } from "./template";
import { fixtureRunBindings } from "./testing/story-text";
import { epitaph, tombstone, type Death } from "./tombstones";
import { PAGE_REACTIONS, PAGE_REACTION_TOO_EARLY, WREN_LINES, wrenLine, wrenStage } from "./wren";

const FRESH: StoryProgress = { runsFinished: 0, endingsSeen: [], pagesHeld: [] };
const at = (slot: number) => slot as Slot;

describe("wrenStage", () => {
  it.each<[string, StoryProgress, string]>([
    ["a first run", FRESH, "W0"],
    ["a returning player", { ...FRESH, runsFinished: 2 }, "W1"],
    ["the Act I ending", { ...FRESH, runsFinished: 1, endingsSeen: ["act-1"] }, "W2"],
    ["the Act II ending", { ...FRESH, endingsSeen: ["act-1", "act-2"] }, "W3"],
    ["the Séance ending", { ...FRESH, endingsSeen: ["act-1", "act-2", "act-3"] }, "W4"],
    ["every page, true ending unseen", { ...FRESH, pagesHeld: [...PAGE_IDS] }, "W5"],
    ["the true ending", { ...FRESH, endingsSeen: ["act-3", "true"], pagesHeld: [] }, "W6"],
  ])("reads %s as %s", (_, progress, stage) => {
    expect(wrenStage(progress, "intern")).toBe(stage);
  });

  it("makes Old Wren's lines her own whatever the progress", () => {
    expect(wrenStage(FRESH, "old_wren")).toBe("OW");
  });
});

describe("wrenLine", () => {
  it("plays a new page's reaction once Wren knows the hand, and holds her tongue before", () => {
    expect(wrenLine("W2", "run-start", "page-3")).toBe(PAGE_REACTIONS["page-3"]);
    expect(wrenLine("W5", "run-start", "page-7")).toBe(PAGE_REACTIONS["page-7"]);
    expect(wrenLine("W1", "run-start", "page-1")).toBe(PAGE_REACTION_TOO_EARLY);
    expect(wrenLine("W6", "run-start", "page-1")).toBe(WREN_LINES.W6["run-start"]);
  });

  it("ignores pages outside run start", () => {
    expect(wrenLine("W3", "death", "page-2")).toBe(WREN_LINES.W3.death);
  });
});

describe("lostCandleScene", () => {
  const base: LostCandle = {
    owner: "mayor",
    seed: "raven-pumpkin-13",
    slot: at(2),
    attempt: 0,
    candlesLeft: 3,
    cost: 1,
    stage: "W0",
  };

  it("gives the owner a line, then Wren's stage line", () => {
    const [owner, wren] = lostCandleScene(base);
    expect(OWNER_LOST_CANDLE.mayor).toContain(owner);
    expect(wren).toBe(WREN_LINES.W0["candle-lost"]);
  });

  it("is the same for the same seed and attempt", () => {
    expect(lostCandleScene(base)).toEqual(lostCandleScene({ ...base }));
  });

  it("varies the owner's line across attempts", () => {
    const lines = new Set(
      Array.from({ length: 20 }, (_, attempt) => lostCandleScene({ ...base, attempt })[0]),
    );
    expect(lines.size).toBe(OWNER_LOST_CANDLE.mayor.length);
  });

  it("has Wren mark the last candle and a boss's double cost", () => {
    expect(lostCandleScene({ ...base, candlesLeft: 1 })[1]).toBe(WREN_ONE_LEFT);
    expect(lostCandleScene({ ...base, cost: 2 })[1]).toBe(WREN_BOSS_COST);
  });

  it("lets Wren speak once in her own hour", () => {
    const scene = lostCandleScene({ ...base, owner: "wren" });
    expect(scene).toHaveLength(1);
    expect(OWNER_LOST_CANDLE.wren).toContain(scene[0]);
    expect(lostCandleScene({ ...base, owner: "wren", cost: 2 })).toEqual([WREN_BOSS_COST]);
  });

  it("renders with the shared bindings and the shown value, or without it in the fog", () => {
    const voice: Voice = { character: "intern", stage: "W0" };
    for (const line of Object.values(OWNER_LOST_CANDLE).flat()) {
      const clear = renderScene([line], { bindings: fixtureRunBindings(), withheld: [] }, voice);
      expect(plainText(clear[0]?.segments ?? [])).not.toMatch(/[{}]/);
      const fogged = renderScene(
        [line],
        { bindings: { ...fixtureRunBindings(), shown_value: 0 }, withheld: ["shown_value"] },
        voice,
      );
      expect(plainText(fogged[0]?.segments ?? [])).not.toMatch(/412|[{}]/);
    }
  });
});

describe("characterRunStart", () => {
  it("hands the Intern the Lantern on the first night only", () => {
    expect(characterRunStart("intern", "W0")).toHaveLength(1);
    expect(characterRunStart("intern", "W1")).toEqual([]);
  });

  it("warms Wren to the Purist once she has named the Hollow", () => {
    expect(characterRunStart("purist", "W2")).toHaveLength(1);
    expect(characterRunStart("purist", "W3")).toHaveLength(2);
  });

  it("greets the Night Clerk as a peer and leaves Old Wren to her thoughts", () => {
    expect(characterRunStart("night_clerk", "W0")[0]?.speaker).toBe("wren");
    expect(characterRunStart("old_wren", "OW")).toEqual([]);
  });
});

describe("hour scenes", () => {
  const intern: Voice = { character: "intern", stage: "W0" };

  it("gives Old Wren her own Séance intro", () => {
    const pack = narrativePack("seance");
    expect(introScene(pack, { character: "old_wren", stage: "OW" })).toBe(pack.oldWrenIntro);
    expect(introScene(pack, intern)).toBe(pack.intro);
  });

  it("tells Marisol's list nobody is cursed when nobody is", () => {
    const pack = narrativePack("thirteenth-door");
    expect(clearedScene(pack, { cursed_count: 0 }, intern)).toBe(pack.clearedIfNone?.scene);
    expect(clearedScene(pack, { cursed_count: 2 }, intern)).toBe(pack.cleared);
  });

  it("drops Wren's joke once she has named the Hollow", () => {
    const pack = narrativePack("wandering-ghost");
    expect(clearedScene(pack, {}, intern)).toBe(pack.cleared);
    expect(clearedScene(pack, {}, { character: "intern", stage: "W3" })).toBe(
      pack.clearedAfterHollow,
    );
  });
});

describe("endings", () => {
  const seen = (...endingsSeen: StoryProgress["endingsSeen"]): StoryProgress => ({
    ...FRESH,
    endingsSeen,
  });

  it("plays each act's ending on its boss's first clear only", () => {
    expect(endingFor(at(2), FRESH)).toBeNull();
    expect(endingFor(at(3), FRESH)).toBe("act-1");
    expect(endingFor(at(3), seen("act-1"))).toBeNull();
    expect(endingFor(at(7), seen("act-1"))).toBe("act-2");
    expect(endingFor(at(7), seen("act-1", "act-2"))).toBeNull();
  });

  it("always ends the Séance, truly when every page is held", () => {
    expect(endingFor(at(10), seen("act-3"))).toBe("act-3");
    expect(endingFor(at(10), { ...FRESH, pagesHeld: [...PAGE_IDS] })).toBe("true");
  });

  it.each(["act-1", "act-2", "act-3", "true"] as const)(
    "%s declares what it reads and renders with no unfilled placeholders",
    (id) => {
      for (const pages of [0, 3]) {
        const { scene, bindings } = ending(id, pages);
        const shared = new Set<string>(SHARED_BINDINGS);
        const used = new Set(
          scene.flatMap((line) => placeholdersOf(line.text).map((slot) => slot.name)),
        );
        for (const name of used)
          expect(bindings.includes(name) || shared.has(name), name).toBe(true);
        for (const name of bindings) expect(used, name).toContain(name);

        const values = Object.fromEntries(bindings.map((name) => [name, 3]));
        const rendered = renderScene(
          scene,
          { bindings: { ...fixtureRunBindings(), ...values }, withheld: [] },
          { character: "night_clerk", stage: "W4" },
        );
        for (const line of rendered) expect(plainText(line.segments)).not.toMatch(/[{}]/);
      }
    },
  );

  it("counts the pages in the Séance ending once the player holds some", () => {
    const text = (pages: number) =>
      ending("act-3", pages)
        .scene.map((line) => line.text)
        .join(" ");
    expect(text(0)).toContain("Some of it is still out there.");
    expect(text(3)).toContain("{pages_found|Word} of seven.");
  });
});

describe("tombstones", () => {
  const failedCheckpoint: Checkpoint = { id: "c", afterBatch: 4, label: "19:15" };
  const death: Death = {
    handle: null,
    character: "intern",
    seed: "raven-pumpkin-13",
    slot: at(1),
    act: 1,
    puzzleId: "porch-lights",
    failedCheckpoint,
    daily: false,
    progress: FRESH,
  };

  it("engraves the stone from the run", () => {
    expect(tombstone(death)).toEqual({
      handle: "A New Hire",
      characterTitle: "The Intern",
      epitaph: epitaph(death),
      hour: "Porch Lights",
      wentOut: "went out at 7:15pm, Halloween 2026",
      seed: "raven-pumpkin-13",
      hollowYear: false,
    });
    expect(narrativePack("porch-lights").epitaphs).toContain(epitaph(death));
  });

  it("shows the same epitaph for a replayed seed, and both across seeds", () => {
    expect(epitaph(death)).toBe(epitaph({ ...death }));
    const seen = new Set(
      Array.from({ length: 30 }, (_, i) => epitaph({ ...death, seed: `seed-${String(i)}` })),
    );
    expect(seen.size).toBe(2);
  });

  it("gives Old Wren and the Daily Haunt their own lines", () => {
    expect(epitaph({ ...death, character: "old_wren" })).toBe("Kept it, this time.");
    expect(epitaph({ ...death, daily: true })).toBe("Had one try. Used it.");
  });

  it("leaves a green 1891 under Act III deaths once the Hollow has a name", () => {
    const late = { ...death, act: 3 as const, slot: at(9), puzzleId: "witching-hour" };
    expect(tombstone(late).hollowYear).toBe(false);
    expect(tombstone({ ...late, progress: { ...FRESH, endingsSeen: ["act-2"] } }).hollowYear).toBe(
      true,
    );
  });
});

describe("fixed text", () => {
  it("names and flavors every relic and curse", () => {
    expect(Object.keys(RELIC_FLAVOR).sort()).toEqual([...RELICS].sort());
    expect(Object.keys(CURSE_FLAVOR).sort()).toEqual([...CURSES].sort());
  });

  it("writes every ledger page as fixed lore that parses", () => {
    for (const page of Object.values(LEDGER_PAGES)) {
      expect(placeholdersOf(page.text)).toEqual([]);
      expect(plainText(renderTemplate(page.text, { bindings: {}, withheld: [] }))).toContain(
        String(page.year),
      );
    }
  });

  it("formats the shared bindings from the hour's checkpoints", () => {
    const bindings = runBindings({
      seed: "s",
      character: "purist",
      candles: 3,
      retention: 2,
      checkpoints: [
        { id: "a", afterBatch: 0, label: "01:15-05:00" },
        { id: "b", afterBatch: 1, label: "01:30-06:00" },
      ],
    });
    expect(bindings).toMatchObject({
      checkpoint: "the first 1:15am",
      checkpoints: "the first 1:15am and the second 1:30am",
      last_checkpoint: "the second 1:30am",
      keeper_name: "the Purist",
      character_title: "The Purist",
    });
    expect(bindings).not.toHaveProperty("failed_checkpoint");
  });
});
