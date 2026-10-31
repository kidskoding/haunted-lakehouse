import { describe, expect, it } from "vitest";
import type { Voice } from "./bindings";
import { ending } from "./endings";
import { clearedScene, introScene, renderCallouts } from "./hour";
import { NARRATIVE_PACKS } from "./packs";
import { plainText, renderScene, renderTemplate, type RenderContext } from "./render";
import {
  allStoryStrings,
  autopsyTemplates,
  fixturePackBindings,
  fixtureRunBindings,
  type StoryString,
} from "./testing/story-text";
import type { Scene } from "./types";

/*
 * The writing bar, as far as a test can hold it: the bible's banned words, the tics that make
 * prose read as generated, technique names outside the autopsy, and the length budgets.
 */

const STRINGS = allStoryStrings();
const INTERN: Voice = { character: "intern", stage: "W0" };

const GENERIC_PROSE = [
  "tapestry",
  "testament to",
  "whispers of",
  "delve",
  "realm",
  "little did",
  "in the end",
  "eerie",
  "embark",
  "unleash",
  "nestled",
  "symphony of",
  "ever-evolving",
  "seamless",
  "game-changer",
  "in conclusion",
  "it's important to note",
  "it's worth noting",
  "dive into",
  "navigate the",
];

/** Words the town never says: technique names belong on the autopsy card alone. */
const TECHNIQUE_NAMES =
  /\b(dedup\w*|deduplicat\w*|window\w*|joins?|joined|schemas?|idempoten\w*|SCD|late data|watermarks?|CDC|merg\w*|vacuum\w*)\b/i;

/** Filler nouns the house style replaces with a named thing in town. */
const VAGUE_NOUNS = /\bthe (data|system|issue)\b/i;

const AUTOPSY_HEDGES = /\b(simply|just|obviously)\b/i;

const describeString = (s: StoryString) => `${s.where}: "${s.source}"`;

function words(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

function sceneWords(scene: Scene, context: RenderContext): number {
  return renderScene(scene, context, INTERN).reduce(
    (total, line) => total + words(plainText(line.segments)),
    0,
  );
}

describe("the writing bar", () => {
  it("collects a meaningful body of story text", () => {
    expect(STRINGS.length).toBeGreaterThan(150);
  });

  it.each(GENERIC_PROSE)("never says %j", (phrase) => {
    for (const s of STRINGS)
      expect(s.source.toLowerCase(), describeString(s)).not.toContain(phrase);
  });

  it("uses no dashes for punctuation", () => {
    for (const s of STRINGS) expect(s.source, describeString(s)).not.toMatch(/[—–]|\s-\s|--/);
  });

  it("keeps exclamation marks in the Mayor's mouth", () => {
    for (const s of STRINGS.filter((s) => s.speaker !== "mayor")) {
      expect(s.source, describeString(s)).not.toContain("!");
    }
  });

  it("writes times the way the town's clocks show them", () => {
    for (const s of STRINGS) {
      expect(s.source, describeString(s)).not.toMatch(/\d\s?(AM|PM|a\.m\.|p\.m\.)/);
    }
  });

  it("never names a technique in a beat, hook, reaction, or callout", () => {
    for (const s of STRINGS.filter((s) => s.kind === "beat" || s.kind === "callout")) {
      expect(s.source, describeString(s)).not.toMatch(TECHNIQUE_NAMES);
      expect(s.source, describeString(s)).not.toMatch(VAGUE_NOUNS);
    }
  });

  it("keeps the autopsy free of hedges and condescension", () => {
    for (const s of STRINGS.filter((s) => s.kind === "autopsy")) {
      expect(s.source, describeString(s)).not.toMatch(AUTOPSY_HEDGES);
    }
  });
});

describe("length budgets", () => {
  describe.each(NARRATIVE_PACKS.map((pack) => [pack.puzzleId, pack] as const))("%s", (_, pack) => {
    const context: RenderContext = {
      bindings: { ...fixtureRunBindings(), ...fixturePackBindings(pack, 7) },
      withheld: [],
    };

    it("keeps the intro to 130 words across its speakers", () => {
      expect(sceneWords(introScene(pack, INTERN), context)).toBeLessThanOrEqual(130);
    });

    it("keeps the cleared beat and the hook under 60 words", () => {
      for (const scene of [
        clearedScene(pack, context.bindings, INTERN),
        pack.clearedIfNone?.scene ?? [],
        pack.clearedAfterHollow ?? [],
        pack.hook,
      ]) {
        expect(sceneWords(scene, context)).toBeLessThan(60);
      }
    });

    it("keeps each tutorial callout to 40 words", () => {
      for (const callout of [
        ...renderCallouts(pack, context, "tour"),
        ...renderCallouts(pack, context, "first-break"),
      ]) {
        expect(words(plainText(callout.segments)), callout.id).toBeLessThanOrEqual(40);
      }
    });

    it("keeps the autopsy readable in a minute: 180 to 280 words", () => {
      const total = autopsyTemplates(pack)
        .map((source) => words(plainText(renderTemplate(source, context))))
        .reduce((a, b) => a + b, 0);
      expect(total).toBeGreaterThanOrEqual(180);
      expect(total).toBeLessThanOrEqual(280);
      expect(pack.autopsy.search.length).toBeGreaterThanOrEqual(3);
      expect(pack.autopsy.search.length).toBeLessThanOrEqual(5);
    });
  });

  it.each(["act-1", "act-2", "act-3", "true"] as const)(
    "keeps the %s ending to 350 words",
    (id) => {
      const bindings = {
        ...fixtureRunBindings(),
        unknown_rows: 3,
        flameouts_total: 41,
        restored_version: 212,
        restored_rows: 4096,
        restored_last_year: 2019,
        lost_versions: 3,
        pages_found: 3,
        lamps_lit_final: 61,
        kids_out: 340,
        pieces_given_total: 9120,
      };
      expect(sceneWords(ending(id, 3).scene, { bindings, withheld: [] })).toBeLessThanOrEqual(350);
    },
  );
});
