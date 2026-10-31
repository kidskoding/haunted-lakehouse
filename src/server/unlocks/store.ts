import "server-only";
import { and, count, eq, ne } from "drizzle-orm";
import { fragments, runs, unlocks } from "../db/schema";
import type { PageId, StoryEndingId } from "../narrative/progress";
import type { RunDatabase } from "../runs/load";
import { isActUnlockKey, isEndingKey, isPageId, type UnlockAward } from "./catalog";
import { charactersFrom, type PlayerUnlocks, unlockedActsFrom } from "./progress";

function awardKey(award: UnlockAward): string {
  return `${award.kind}:${award.key}`;
}

/** Loads every unlock and ledger page this player holds, plus finished-run count. */
export async function loadPlayerUnlocks(
  database: RunDatabase,
  playerId: string,
): Promise<PlayerUnlocks> {
  const [rows, pageRows, [finished]] = await Promise.all([
    database.select().from(unlocks).where(eq(unlocks.playerId, playerId)),
    database
      .select({ fragmentId: fragments.fragmentId })
      .from(fragments)
      .where(eq(fragments.playerId, playerId)),
    database
      .select({ n: count() })
      .from(runs)
      .where(and(eq(runs.playerId, playerId), ne(runs.status, "active"))),
  ]);

  const actKeys: string[] = [];
  const characterKeys: string[] = [];
  const endings: StoryEndingId[] = [];

  for (const row of rows) {
    switch (row.kind) {
      case "act":
        if (isActUnlockKey(row.key)) actKeys.push(row.key);
        break;
      case "character":
        characterKeys.push(row.key);
        break;
      case "ending":
        if (isEndingKey(row.key)) endings.push(row.key);
        break;
    }
  }

  const pages: PageId[] = [];
  for (const row of pageRows) {
    if (isPageId(row.fragmentId)) pages.push(row.fragmentId);
  }

  endings.sort();
  pages.sort();

  return {
    unlockedActs: unlockedActsFrom(actKeys),
    characters: charactersFrom(characterKeys),
    endings,
    fragments: pages,
    runsFinished: finished?.n ?? 0,
  };
}

/**
 * Persists unlock awards idempotently. Existing (player, kind, key) rows are left alone; only
 * newly written awards are returned.
 */
export async function grantUnlocks(
  database: RunDatabase,
  playerId: string,
  awards: readonly UnlockAward[],
): Promise<readonly UnlockAward[]> {
  if (awards.length === 0) return [];

  const existing = await database.select().from(unlocks).where(eq(unlocks.playerId, playerId));
  const held = new Set(existing.map((row) => awardKey({ kind: row.kind, key: row.key })));
  const fresh = awards.filter((award) => !held.has(awardKey(award)));
  if (fresh.length === 0) return [];

  await database
    .insert(unlocks)
    .values(fresh.map((award) => ({ playerId, kind: award.kind, key: award.key })));
  return fresh;
}

/**
 * Records a ledger page for this player. Idempotent on (player, fragment); the finding run
 * is kept only on the first insert so later finds don't overwrite provenance.
 */
export async function grantFragment(
  database: RunDatabase,
  playerId: string,
  fragmentId: PageId,
  runId: string | null,
): Promise<boolean> {
  const [held] = await database
    .select({ fragmentId: fragments.fragmentId })
    .from(fragments)
    .where(and(eq(fragments.playerId, playerId), eq(fragments.fragmentId, fragmentId)))
    .limit(1);
  if (held) return false;

  await database.insert(fragments).values({ playerId, fragmentId, runId });
  return true;
}
