import { describe, expect, it } from "vitest";
import { PAGE_IDS } from "../narrative/progress";
import { characterSelectView, type CharacterCard } from "./character-select";
import { applyAwards, awardsForBossClear, FRESH_UNLOCKS } from "./progress";

function card(cards: readonly CharacterCard[], id: CharacterCard["id"]): CharacterCard {
  const found = cards.find((entry) => entry.id === id);
  if (!found) throw new Error(`no card for ${id}`);
  return found;
}

const MIDGAME = applyAwards(FRESH_UNLOCKS, [
  ...awardsForBossClear("act-1", []),
  ...awardsForBossClear("act-2", []),
]);
const COMPLETE = applyAwards(MIDGAME, awardsForBossClear("act-3", PAGE_IDS), PAGE_IDS);

describe("characterSelectView", () => {
  it("opens only the Intern for a new player, with Wren's first-night line", () => {
    const view = characterSelectView(FRESH_UNLOCKS);
    expect(view.cards.map((entry) => [entry.id, entry.locked])).toEqual([
      ["intern", false],
      ["night_clerk", true],
      ["purist", true],
      ["old_wren", true],
    ]);
    expect(view.defaultCharacter).toBe("intern");
    expect(card(view.cards, "intern")).toMatchObject({
      name: "The Intern",
      candles: 4,
      startingRelics: ["Wren's Lantern"],
      quote: [
        {
          speaker: "Wren",
          text: "Take this. You'll need to see where things came from, and nobody else will show you.",
        },
      ],
    });
  });

  it("names each locked character's unlock condition", () => {
    const { cards } = characterSelectView(FRESH_UNLOCKS);
    expect(card(cards, "night_clerk")).toMatchObject({
      unlockHint: "Clear the Act I boss to unlock.",
      preview: { name: "The Night Clerk", candles: 3, startingRelics: [] },
    });
    expect(card(cards, "purist")).toMatchObject({
      unlockHint: "Clear the Act II boss to unlock.",
      preview: {
        rules: [
          "Picks from two relics after each hour.",
          "No table models. Incremental or nothing.",
        ],
      },
    });
    expect(card(cards, "old_wren")).toMatchObject({
      unlockHint: "Reach the true ending to unlock.",
      preview: null,
    });
  });

  it("never sends a locked Old Wren's name to the browser", () => {
    const wrenCard = card(characterSelectView(MIDGAME).cards, "old_wren");
    expect(JSON.stringify(wrenCard)).not.toMatch(/Old Wren|VACUUM/);
  });

  it("opens the act characters with their rules and run-start lines", () => {
    const { cards } = characterSelectView(MIDGAME);
    expect(card(cards, "night_clerk")).toMatchObject({
      locked: false,
      rules: ["Picks from three relics after each hour."],
      quote: [{ speaker: "Wren", text: "You know the stacks. Good." }],
    });
    // Act II's ending names the Hollow, so Wren adds her line for the Purist.
    expect(card(cards, "purist")).toMatchObject({
      locked: false,
      quote: [
        {
          speaker: null,
          text: "The Purist arrives at 5:58pm and asks where the incremental models are.",
        },
        {
          speaker: "Wren",
          text: "You don't throw things out. All right. You're not one of them.",
        },
      ],
    });
    // Past the first night the Intern's scene is empty, so the card falls back to flavor.
    expect(card(cards, "intern")).toMatchObject({ quote: [{ speaker: null }] });
  });

  it("reveals Old Wren after the true ending", () => {
    expect(card(characterSelectView(COMPLETE).cards, "old_wren")).toMatchObject({
      locked: false,
      name: "Old Wren",
      candles: 1,
      startingRelics: [],
      rules: ["No relics, ever."],
    });
  });
});
