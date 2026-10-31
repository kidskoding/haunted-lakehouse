import "server-only";
import { CHARACTERS } from "../engine/run/characters";
import type { CharacterId } from "../engine/run/types";
import { PERSONAS } from "../narrative/bindings";
import { numberWord } from "../narrative/format";
import { RELIC_FLAVOR } from "../narrative/flavor";
import { characterRunStart } from "../narrative/reactions";
import { plainText, renderLine } from "../narrative/render";
import type { Speaker } from "../narrative/types";
import { wrenStage } from "../narrative/wren";
import { ACT_UNLOCK_KEYS, ALL_CHARACTERS, CHARACTER_UNLOCKS, type UnlockAward } from "./catalog";
import { isCharacterUnlocked, type PlayerUnlocks, storyProgressFrom } from "./progress";

export interface CharacterQuote {
  /** Who says it, or null for the narrator. */
  readonly speaker: string | null;
  readonly text: string;
}

/** A character the player may pick. */
export interface UnlockedCharacterCard {
  readonly id: CharacterId;
  readonly locked: false;
  readonly name: string;
  readonly candles: number;
  /** Relic names, empty when the character starts with none. */
  readonly startingRelics: readonly string[];
  readonly rules: readonly string[];
  /** Run-start lines for this player's stage, or a line of flavor when the story has none. */
  readonly quote: readonly CharacterQuote[];
}

/** A character still to earn: what it costs to see them, and as much of them as is safe to show. */
export interface LockedCharacterCard {
  readonly id: CharacterId;
  readonly locked: true;
  readonly unlockHint: string;
  /** Null while the character is a secret (Old Wren): the card shows a stand-in instead. */
  readonly preview: {
    readonly name: string;
    readonly candles: number;
    readonly startingRelics: readonly string[];
    readonly rules: readonly string[];
  } | null;
  /** Shown when there is no preview. */
  readonly mystery: string | null;
}

export type CharacterCard = UnlockedCharacterCard | LockedCharacterCard;

export interface CharacterSelectView {
  readonly cards: readonly CharacterCard[];
  /** The character checked when the screen opens: the first one the player may pick. */
  readonly defaultCharacter: CharacterId;
}

const SPEAKER_NAMES: Readonly<Partial<Record<Speaker, string>>> = {
  wren: "Wren",
  mayor: "The Mayor",
  marisol: "Marisol",
};

/** For characters whose run-start scene is empty: the Intern after night one, and Old Wren. */
const FLAVOR: Readonly<Record<CharacterId, string>> = {
  intern: "Hired this afternoon. Nobody has said where anything is kept.",
  night_clerk: "Has worked the overnight desk longer than the lakehouse has had a name.",
  purist: "Will not rebuild a table from scratch. Not tonight, not ever.",
  old_wren: "She ran the VACUUM. She has had six years to think about it.",
};

const MYSTERY = "Someone in Hollow Creek knows what happened to the old ledger, and is not saying.";

function unlockHint(requires: UnlockAward): string {
  if (requires.kind === "act") {
    return requires.key === ACT_UNLOCK_KEYS[2]
      ? "Clear the Act I boss to unlock."
      : "Clear the Act II boss to unlock.";
  }
  return "Reach the true ending to unlock.";
}

/** What sets a character apart at the table, in plain words: their relic offer and model rules. */
export function rulesFor(id: CharacterId): string[] {
  const { offerSize, tableMaterialization } = CHARACTERS[id];
  const rules: string[] = [];
  rules.push(
    offerSize === 0
      ? "No relics, ever."
      : `Picks from ${numberWord(offerSize)} relics after each hour.`,
  );
  if (!tableMaterialization) rules.push("No table models. Incremental or nothing.");
  return rules;
}

function relicNames(id: CharacterId): string[] {
  return CHARACTERS[id].startingRelics.map((relic) => RELIC_FLAVOR[relic].name);
}

function quoteFor(id: CharacterId, unlocks: PlayerUnlocks): CharacterQuote[] {
  const stage = wrenStage(storyProgressFrom(unlocks), id);
  const scene = characterRunStart(id, stage);
  if (scene.length === 0) return [{ speaker: null, text: FLAVOR[id] }];
  return scene.map((line) => ({
    speaker: SPEAKER_NAMES[line.speaker] ?? null,
    text: plainText(
      renderLine(line, { bindings: {}, withheld: [] }, { character: id, stage }).segments,
    ),
  }));
}

/**
 * Everything the character select shows, built on the server so a locked secret character
 * never reaches the browser. Order follows the catalog; the Intern is always first.
 */
export function characterSelectView(unlocks: PlayerUnlocks): CharacterSelectView {
  const cards = ALL_CHARACTERS.map((id): CharacterCard => {
    const name = PERSONAS[id].title;
    if (isCharacterUnlocked(id, unlocks)) {
      return {
        id,
        locked: false,
        name,
        candles: CHARACTERS[id].candles,
        startingRelics: relicNames(id),
        rules: rulesFor(id),
        quote: quoteFor(id, unlocks),
      };
    }
    // The starter is always unlocked, so every locked character has a catalog rule.
    const rule = id === "intern" ? null : CHARACTER_UNLOCKS[id];
    const secret = id === "old_wren";
    return {
      id,
      locked: true,
      unlockHint: rule ? unlockHint(rule.requires) : "",
      preview: secret
        ? null
        : {
            name,
            candles: CHARACTERS[id].candles,
            startingRelics: relicNames(id),
            rules: rulesFor(id),
          },
      mystery: secret ? MYSTERY : null,
    };
  });
  const first = cards.find((card) => !card.locked);
  return { cards, defaultCharacter: first?.id ?? "intern" };
}
