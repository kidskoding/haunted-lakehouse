import "server-only";
import type { CharacterId, EndingId } from "../engine/run/types";
import type { Act } from "../engine/slots";
import type { PageId, StoryEndingId } from "../narrative/progress";
import { PAGE_IDS } from "../narrative/progress";

/** Rows the `unlocks` table stores: acts beyond I, unlockable characters, and endings seen. */
export type UnlockKind = "act" | "character" | "ending";

export interface UnlockAward {
  readonly kind: UnlockKind;
  readonly key: string;
}

/** Act I is always open; later acts are stored as `act-2` / `act-3`. */
export const ACT_UNLOCK_KEYS: Readonly<Record<Exclude<Act, 1>, string>> = {
  2: "act-2",
  3: "act-3",
};

/**
 * Characters beyond the Intern, and what unlocks them. Night Clerk and Purist ride the act
 * gates (CLAUDE.md only names Old Wren's condition explicitly); Old Wren needs the true ending.
 */
export const CHARACTER_UNLOCKS: Readonly<
  Record<Exclude<CharacterId, "intern">, { readonly requires: UnlockAward }>
> = {
  night_clerk: { requires: { kind: "act", key: ACT_UNLOCK_KEYS[2] } },
  purist: { requires: { kind: "act", key: ACT_UNLOCK_KEYS[3] } },
  old_wren: { requires: { kind: "ending", key: "true" } },
};

export const STARTER_CHARACTER: CharacterId = "intern";

export const ALL_CHARACTERS: readonly CharacterId[] = [
  "intern",
  "night_clerk",
  "purist",
  "old_wren",
];

export const ALL_ENDING_KEYS: readonly StoryEndingId[] = ["act-1", "act-2", "act-3", "true"];

export function isPageId(value: string): value is PageId {
  return (PAGE_IDS as readonly string[]).includes(value);
}

export function isEndingKey(value: string): value is StoryEndingId {
  return (ALL_ENDING_KEYS as readonly string[]).includes(value);
}

export function isActUnlockKey(value: string): value is (typeof ACT_UNLOCK_KEYS)[2 | 3] {
  return value === ACT_UNLOCK_KEYS[2] || value === ACT_UNLOCK_KEYS[3];
}

/** The act a boss ending opens next, if any. Act III has no further gate. */
export function nextActAfterEnding(ending: EndingId): 2 | 3 | null {
  switch (ending) {
    case "act-1":
      return 2;
    case "act-2":
      return 3;
    case "act-3":
      return null;
  }
}
