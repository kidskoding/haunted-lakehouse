import "server-only";
import { and, count, eq, ne } from "drizzle-orm";
import { fragments, runs, unlocks } from "../db/schema";
import type { PageId, StoryEndingId } from "../narrative/progress";
import type { RunExecutor } from "../runs/load";
import { isActUnlockKey, isEndingKey, isPageId, type UnlockAward } from "./catalog";
import { charactersFrom, type PlayerUnlocks, unlockedActsFrom } from "./progress";

function awardKey(award: UnlockAward): string {
  return `${award.kind}:${award.key}`;
}

/** Loads every unlock and ledger page this player holds, plus finished-run count. */
export async function loadPlayerUnlocks(
  database: RunExecutor,
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
 * Persists unlock awards idempotently. Existing (player, kind, key) rows are left alone, even
 * when a racing writer stored them a moment ago; only newly written awards are returned.
 */
export async function grantUnlocks(
  database: RunExecutor,
  playerId: string,
  awards: readonly UnlockAward[],
): Promise<readonly UnlockAward[]> {
  if (awards.length === 0) return [];

  const written = await database
    .insert(unlocks)
    .values(awards.map((award) => ({ playerId, kind: award.kind, key: award.key })))
    .onConflictDoNothing()
    .returning();
  const fresh = new Set(written.map(awardKey));
  return awards.filter((award) => fresh.has(awardKey(award)));
}

/**
 * Records a ledger page for this player. Idempotent on (player, fragment); the finding run
 * is kept only on the first insert so later finds don't overwrite provenance.
 */
export async function grantFragment(
  database: RunExecutor,
  playerId: string,
  fragmentId: PageId,
  runId: string | null,
): Promise<boolean> {
  const written = await database
    .insert(fragments)
    .values({ playerId, fragmentId, runId })
    .onConflictDoNothing()
    .returning();
  return written.length > 0;
}
