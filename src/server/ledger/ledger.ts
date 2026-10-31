import "server-only";
import type { LedgerLeaf, LedgerView } from "@/lib/crypt/ledger";
import { db } from "../db/client";
import { LEDGER_PAGES } from "../narrative/pages";
import { PAGE_IDS, type PageId, type StoryEndingId } from "../narrative/progress";
import { renderLine, renderTemplate } from "../narrative/render";
import { WREN_LINES } from "../narrative/wren";
import { currentPlayerId } from "../session/session";
import { FRESH_UNLOCKS } from "../unlocks/progress";
import { loadPlayerUnlocks } from "../unlocks/store";

const FIXED_LORE = { bindings: {}, withheld: [] } as const;

/**
 * The Ledger from the pages a player holds. A found page is rendered here, on the server; a
 * missing one ships only its numeral, since its text is the mystery the pages give away.
 */
export function ledgerView(
  pagesHeld: readonly PageId[],
  endingsSeen: readonly StoryEndingId[],
): LedgerView {
  const held = new Set(pagesHeld);
  const leaves = PAGE_IDS.map((id): LedgerLeaf => {
    const { numeral, year, text } = LEDGER_PAGES[id];
    return held.has(id)
      ? { kind: "found", page: { numeral, year, segments: renderTemplate(text, FIXED_LORE) } }
      : { kind: "torn", numeral };
  });
  if (!PAGE_IDS.every((id) => held.has(id))) return { leaves, closing: null };

  // Wren's run-start line at the stage the pages bring her to: the night still ahead, or kept.
  const stage = endingsSeen.includes("true") ? "W6" : "W5";
  const closing = renderLine(WREN_LINES[stage]["run-start"], FIXED_LORE, {
    character: "intern",
    stage,
  });
  return { leaves, closing };
}

/**
 * The caller's Ledger. A visitor with no session holds no pages. Null when the session or
 * database can't be read, so the page can say so instead of showing a Ledger emptier than the
 * player's.
 */
export async function loadLedger(): Promise<LedgerView | null> {
  try {
    const playerId = await currentPlayerId();
    const unlocks = playerId ? await loadPlayerUnlocks(db(), playerId) : FRESH_UNLOCKS;
    return ledgerView(unlocks.fragments, unlocks.endings);
  } catch (error) {
    console.error("The Ledger couldn't read this player's pages", error);
    return null;
  }
}
