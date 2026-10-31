import { describe, expect, it } from "vitest";
import type { Puzzle } from "../engine/puzzle";
import { ALL_PUZZLES } from "../engine/puzzles";
import { generatePuzzle } from "../engine/registry";
import { fakePuzzle } from "../engine/testing/fake-puzzle";
import { SHARED_BINDINGS, type Bindings } from "./bindings";
import { mayor, wren } from "./lines";
import { NARRATIVE_PACKS, narrativePack } from "./packs";
import { LOST_CANDLE_BINDINGS } from "./reactions";
import { placeholdersOf } from "./template";
import {
  autopsyTemplates,
  fixturePackBindings,
  fixtureRunBindings,
  packScenes,
  packSymptoms,
  packTemplates,
  renderPack,
} from "./testing/story-text";
import type { BindingKind, NarrativePack } from "./types";

const SHARED = new Set<string>([...SHARED_BINDINGS, ...LOST_CANDLE_BINDINGS]);
const SEEDS = Array.from({ length: 20 }, (_, i) => `narrative-seed-${String(i)}`);
const UNFILLED = /[{}]/;

/**
 * Renders a pack against a puzzle's generated data for many seeds, clear and fogged. This is
 * the check every registered puzzle passes: the story it tells has no holes, whatever the seed.
 */
function expectPuzzleRenders(puzzle: Puzzle, pack: NarrativePack): void {
  for (const seed of SEEDS) {
    const data = generatePuzzle(puzzle, seed);
    for (const [key, kind] of Object.entries(pack.bindings)) {
      const value = data.narrative[key];
      expect(value, `${puzzle.id} binds ${key} for seed ${seed}`).toBeDefined();
      expect(typeof value, `${puzzle.id}'s ${key} is a ${kind}`).toBe(
        kind === "count" ? "number" : "string",
      );
    }
    const bindings: Bindings = {
      ...fixtureRunBindings(data.checkpoints, puzzle.retention),
      ...data.narrative,
    };
    for (const text of renderPack(pack, { bindings, withheld: [] })) {
      expect(text).not.toMatch(UNFILLED);
    }
    const withheld = packSymptoms(pack);
    const fogged = Object.fromEntries(
      Object.entries(bindings).filter(([key]) => !withheld.includes(key)),
    );
    for (const text of renderPack(pack, { bindings: fogged, withheld })) {
      expect(text).not.toMatch(UNFILLED);
    }
  }
}

describe("narrative packs", () => {
  it("cover every hour of the night once, keyed by the planned puzzle ids", () => {
    expect(NARRATIVE_PACKS.map((pack) => pack.puzzleId)).toEqual([
      "porch-lights",
      "thirteenth-door",
      "possessed-feed",
      "hall-of-mirrors",
      "wandering-ghost",
      "changeling",
      "graveyard-shift",
      "candy-co-op",
      "witching-hour",
      "seance",
    ]);
    expect(narrativePack("possessed-feed").title).toBe("The Possessed Feed");
    expect(() => narrativePack("nowhere")).toThrow(/no story/);
  });

  it("mark the Act I hours as launch text and the rest as drafts", () => {
    const launch = NARRATIVE_PACKS.filter((pack) => pack.status === "launch");
    expect(launch.map((pack) => pack.puzzleId)).toEqual([
      "porch-lights",
      "thirteenth-door",
      "possessed-feed",
    ]);
  });

  describe.each(NARRATIVE_PACKS.map((pack) => [pack.puzzleId, pack] as const))("%s", (_, pack) => {
    it("parses every template", () => {
      for (const source of packTemplates(pack)) expect(() => placeholdersOf(source)).not.toThrow();
    });

    it("uses only placeholders it declares or the run shares", () => {
      for (const source of packTemplates(pack)) {
        for (const { name } of placeholdersOf(source)) {
          expect(
            name in pack.bindings || SHARED.has(name),
            `{${name}} in "${source}" is declared`,
          ).toBe(true);
        }
      }
    });

    it("uses every binding it declares", () => {
      const used = new Set(
        packTemplates(pack).flatMap((s) => placeholdersOf(s).map((p) => p.name)),
      );
      for (const name of Object.keys(pack.bindings)) expect(used, name).toContain(name);
      if (pack.clearedIfNone) expect(pack.bindings).toHaveProperty(pack.clearedIfNone.binding);
    });

    it("gives every line with a symptom a fog version that holds none", () => {
      for (const line of packScenes(pack).flat()) {
        const symptoms = placeholdersOf(line.text).filter((slot) => slot.symptom);
        if (symptoms.length > 0) expect(line.fog, line.text).toBeDefined();
        if (line.fog !== undefined) {
          expect(symptoms.length, `${line.text} needs no fog version`).toBeGreaterThan(0);
          expect(placeholdersOf(line.fog).filter((slot) => slot.symptom)).toEqual([]);
        }
      }
    });

    it("keeps symptoms out of everything but the intro", () => {
      const outside = [...pack.cleared, ...pack.hook].concat(
        pack.clearedIfNone?.scene ?? [],
        pack.clearedAfterHollow ?? [],
      );
      const later = [
        ...outside.map((line) => line.text),
        ...autopsyTemplates(pack),
        ...pack.epitaphs,
      ];
      for (const source of later) {
        expect(
          placeholdersOf(source).filter((slot) => slot.symptom),
          source,
        ).toEqual([]);
      }
    });

    it("has an intro, a hook into it unless it opens the night, and a beat unless an ending plays", () => {
      expect(pack.intro.length).toBeGreaterThan(0);
      expect(pack.hook.length === 0).toBe(pack.puzzleId === "porch-lights");
      expect(pack.cleared.length === 0).toBe(pack.puzzleId === "seance");
    });

    it.each([0, 1, 7])(
      "renders every text with no unfilled placeholders, with stand-in values of %i",
      (count) => {
        const bindings = { ...fixtureRunBindings(), ...fixturePackBindings(pack, count) };
        for (const text of renderPack(pack, { bindings, withheld: [] })) {
          expect(text).not.toMatch(UNFILLED);
        }
      },
    );

    it("renders under the Curse of the Fog with its symptoms withheld", () => {
      const withheld = packSymptoms(pack);
      const bindings = Object.fromEntries(
        Object.entries({ ...fixtureRunBindings(), ...fixturePackBindings(pack, 7) }).filter(
          ([key]) => !withheld.includes(key),
        ),
      );
      for (const text of renderPack(pack, { bindings, withheld })) {
        expect(text).not.toMatch(UNFILLED);
      }
    });
  });
});

describe("every registered puzzle", () => {
  it("has a story that renders with no unfilled placeholders across 20 seeds", () => {
    for (const puzzle of ALL_PUZZLES) expectPuzzleRenders(puzzle, narrativePack(puzzle.id));
  });

  it("is checked the same way a real puzzle would be", () => {
    // A stand-in hour and story, so the check above is proven to bite while ALL_PUZZLES is
    // still filling up.
    const bindings: Readonly<Record<string, BindingKind>> = { finalTotal: "count" };
    const pack: NarrativePack = {
      puzzleId: "fake",
      title: "A Fake Hour",
      status: "draft",
      owner: "mayor",
      bindings,
      intro: [mayor("At {checkpoint} the total was {*finalTotal}.", "The total is unclear.")],
      cleared: [wren("{finalTotal|plural:reading,readings} by {last_checkpoint}.")],
      hook: [mayor("Something about totals.")],
      autopsy: {
        title: "Totals",
        town: "{finalTotal}",
        tempting: "t",
        idea: "i",
        production: "p",
        search: [],
      },
      epitaphs: ["a", "b"],
    };
    expect(() => {
      expectPuzzleRenders(fakePuzzle(), pack);
    }).not.toThrow();

    const misbound = { ...pack, bindings: { ...bindings, missing: "count" as const } };
    expect(() => {
      expectPuzzleRenders(fakePuzzle(), misbound);
    }).toThrow(/missing/);

    const holey = { ...pack, hook: [mayor("Ask {nobody}.")] };
    expect(() => {
      expectPuzzleRenders(fakePuzzle(), holey);
    }).toThrow(/nobody/);
  });
});
