import "server-only";
import type { RunState } from "../engine/run/types";
import type { RunExecutor } from "../runs/load";
import type { UnlockAward } from "./catalog";
import { awardsAfterReduce } from "./progress";
import { grantUnlocks, loadPlayerUnlocks } from "./store";

/**
 * After a reducer step, persist any boss unlocks this clear earned. Reads the player's
 * current fragments so a Séance clear can become the true ending when every page is held.
 */
export async function applyUnlocksAfterReduce(
  database: RunExecutor,
  playerId: string,
  before: RunState,
  after: RunState,
): Promise<readonly UnlockAward[]> {
  const progress = await loadPlayerUnlocks(database, playerId);
  const awards = awardsAfterReduce(before, after, progress.fragments);
  return grantUnlocks(database, playerId, awards);
}
