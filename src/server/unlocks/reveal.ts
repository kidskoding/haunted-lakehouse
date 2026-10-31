import "server-only";
import type { EndingRevealView, RevealedCharacter } from "@/lib/run/ending";
import { CHARACTERS } from "../engine/run/characters";
import type { CharacterId } from "../engine/run/types";
import { PERSONAS } from "../narrative/bindings";
import { ACT_UNLOCK_KEYS, ALL_CHARACTERS, type UnlockAward } from "./catalog";
import { rulesFor } from "./character-select";

function isCharacterId(key: string): key is CharacterId {
  return (ALL_CHARACTERS as readonly string[]).includes(key);
}

/**
 * What the ending moment reveals, from the awards `grantUnlocks` actually wrote. Those are only
 * the new ones, so a repeat clear (nothing granted) reveals nothing and returns null.
 */
export function endingReveal(granted: readonly UnlockAward[]): EndingRevealView | null {
  let act: EndingRevealView["act"] = null;
  const characters: RevealedCharacter[] = [];
  for (const award of granted) {
    if (award.kind === "act") {
      if (award.key === ACT_UNLOCK_KEYS[2]) act = 2;
      else if (award.key === ACT_UNLOCK_KEYS[3]) act = 3;
    } else if (award.kind === "character" && isCharacterId(award.key)) {
      characters.push({
        name: PERSONAS[award.key].title,
        candles: CHARACTERS[award.key].candles,
        rules: rulesFor(award.key),
      });
    }
  }
  return act === null && characters.length === 0 ? null : { act, characters };
}
