import "server-only";
import type { CryptCounts } from "@/lib/crypt/destinations";
import { db } from "../db/client";
import { PAGE_IDS } from "../narrative/progress";
import { currentPlayerId } from "../session/session";
import { ALL_CHARACTERS } from "./catalog";
import { FRESH_UNLOCKS, type PlayerUnlocks } from "./progress";
import { loadPlayerUnlocks } from "./store";

/** The Crypt's counts from a player's unlocks. */
export function cryptCountsFrom(unlocks: PlayerUnlocks): CryptCounts {
  return {
    characters: { held: unlocks.characters.length, total: ALL_CHARACTERS.length },
    pages: { held: unlocks.fragments.length, total: PAGE_IDS.length },
  };
}

/**
 * The caller's Crypt counts. A visitor with no session is a new player and holds what a new
 * player holds. Null when the session or database can't be read, so the hub omits the numbers
 * instead of showing wrong ones.
 */
export async function loadCryptCounts(): Promise<CryptCounts | null> {
  try {
    const playerId = await currentPlayerId();
    const unlocks = playerId ? await loadPlayerUnlocks(db(), playerId) : FRESH_UNLOCKS;
    return cryptCountsFrom(unlocks);
  } catch (error) {
    console.error("The Crypt couldn't read this player's unlocks", error);
    return null;
  }
}
