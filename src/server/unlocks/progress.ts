import "server-only";
import type { CharacterId, EndingId, RunConfig, RunState } from "../engine/run/types";
import type { Act } from "../engine/slots";
import {
  holdsEveryPage,
  type PageId,
  type StoryEndingId,
  type StoryProgress,
} from "../narrative/progress";
import {
  ACT_UNLOCK_KEYS,
  ALL_CHARACTERS,
  CHARACTER_UNLOCKS,
  STARTER_CHARACTER,
  isEndingKey,
  type UnlockAward,
  nextActAfterEnding,
} from "./catalog";

/** Everything a player has earned across runs, used to gate new nights and story. */
export interface PlayerUnlocks {
  readonly unlockedActs: Act;
  readonly characters: readonly CharacterId[];
  readonly endings: readonly StoryEndingId[];
  readonly fragments: readonly PageId[];
  readonly runsFinished: number;
}

export const FRESH_UNLOCKS: PlayerUnlocks = {
  unlockedActs: 1,
  characters: [STARTER_CHARACTER],
  endings: [],
  fragments: [],
  runsFinished: 0,
};

/**
 * Highest act the player may open a run into. Act I needs no row; `act-2` / `act-3` raise the
 * ceiling. Unknown keys are ignored so a corrupt row never soft-locks a player.
 */
export function unlockedActsFrom(actKeys: readonly string[]): Act {
  let highest: Act = 1;
  for (const key of actKeys) {
    if (key === ACT_UNLOCK_KEYS[3]) highest = 3;
    else if (key === ACT_UNLOCK_KEYS[2] && highest < 2) highest = 2;
  }
  return highest;
}

/** Characters the player may pick. The Intern is always available. */
export function charactersFrom(characterKeys: readonly string[]): readonly CharacterId[] {
  const owned = new Set(characterKeys);
  return ALL_CHARACTERS.filter((id) => id === STARTER_CHARACTER || owned.has(id));
}

/** Whether this character is available given the player's unlock rows. */
export function isCharacterUnlocked(
  character: CharacterId,
  unlocks: Pick<PlayerUnlocks, "characters">,
): boolean {
  return unlocks.characters.includes(character);
}

/**
 * What a fresh run may open: the player's act ceiling, but only if the chosen character is
 * unlocked. Returns null when the character is still locked.
 */
export function runConfigFor(
  unlocks: PlayerUnlocks,
  seed: string,
  character: CharacterId,
): RunConfig | null {
  if (!isCharacterUnlocked(character, unlocks)) return null;
  return { seed, character, unlockedActs: unlocks.unlockedActs };
}

/** Story selectors only need endings, pages, and how many nights the player has finished. */
export function storyProgressFrom(unlocks: PlayerUnlocks): StoryProgress {
  return {
    runsFinished: unlocks.runsFinished,
    endingsSeen: unlocks.endings,
    pagesHeld: unlocks.fragments,
  };
}

/**
 * Unlocks granted the moment a boss hour clears. Act I/II clear the next act and its
 * companion character; the Séance writes `act-3`, or `true` plus Old Wren when every page is
 * already held.
 */
export function awardsForBossClear(
  ending: EndingId,
  pagesHeld: readonly PageId[],
): readonly UnlockAward[] {
  const awards: UnlockAward[] = [];

  if (ending === "act-3") {
    if (holdsEveryPage({ runsFinished: 0, endingsSeen: [], pagesHeld })) {
      awards.push({ kind: "ending", key: "true" });
      awards.push({ kind: "character", key: "old_wren" });
    } else {
      awards.push({ kind: "ending", key: "act-3" });
    }
    return awards;
  }

  awards.push({ kind: "ending", key: ending });
  const next = nextActAfterEnding(ending);
  if (next !== null) {
    const actKey = ACT_UNLOCK_KEYS[next];
    awards.push({ kind: "act", key: actKey });
    for (const character of ["night_clerk", "purist", "old_wren"] as const) {
      const rule = CHARACTER_UNLOCKS[character];
      if (rule.requires.kind === "act" && rule.requires.key === actKey) {
        awards.push({ kind: "character", key: character });
      }
    }
  }
  return awards;
}

/**
 * Awards implied by a post-reduce run state. Only a boss clear (when `lastEnding` is set and
 * the just-closed hour was a boss) produces rows; callers pass the previous ending so a relic
 * phase after a mid-act boss doesn't re-fire.
 */
export function awardsAfterReduce(
  before: RunState,
  after: RunState,
  pagesHeld: readonly PageId[],
): readonly UnlockAward[] {
  if (after.lastEnding === null) return [];
  if (before.lastEnding === after.lastEnding) return [];
  return awardsForBossClear(after.lastEnding, pagesHeld);
}

/** Merge granted awards into an in-memory snapshot (for tests and response shaping). */
export function applyAwards(
  unlocks: PlayerUnlocks,
  awards: readonly UnlockAward[],
  newFragments: readonly PageId[] = [],
): PlayerUnlocks {
  const actKeys = new Set<string>();
  if (unlocks.unlockedActs >= 2) actKeys.add(ACT_UNLOCK_KEYS[2]);
  if (unlocks.unlockedActs >= 3) actKeys.add(ACT_UNLOCK_KEYS[3]);

  const characterKeys = new Set<string>(unlocks.characters.filter((c) => c !== STARTER_CHARACTER));
  const endings = new Set<StoryEndingId>(unlocks.endings);
  const pages = new Set<PageId>(unlocks.fragments);

  for (const award of awards) {
    switch (award.kind) {
      case "act":
        actKeys.add(award.key);
        break;
      case "character":
        characterKeys.add(award.key);
        break;
      case "ending":
        if (isEndingKey(award.key)) endings.add(award.key);
        break;
    }
  }
  for (const page of newFragments) pages.add(page);

  return {
    unlockedActs: unlockedActsFrom([...actKeys]),
    characters: charactersFrom([...characterKeys]),
    endings: [...endings].sort(),
    fragments: [...pages].sort(),
    runsFinished: unlocks.runsFinished,
  };
}
