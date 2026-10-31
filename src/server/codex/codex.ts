import "server-only";
import type { CodexEntry } from "@/lib/crypt/codex";
import { db } from "../db/client";
import { generateHour } from "../engine/curses/apply";
import type { Puzzle } from "../engine/puzzle";
import { ALL_PUZZLES } from "../engine/puzzles";
import { slotDefinition } from "../engine/slots";
import { runBindings } from "../narrative/bindings";
import { formatClock } from "../narrative/format";
import { renderAutopsy } from "../narrative/hour";
import { narrativePack } from "../narrative/packs";
import { currentPlayerId } from "../session/session";
import { type EarnedClear, loadEarnedClears } from "./earned";

/** The Codex's pages: one per registered puzzle, in the order of the night. */
const CODEX_PUZZLES: readonly Puzzle[] = [...ALL_PUZZLES].sort(
  (a, b) => a.slot - b.slot || (a.id < b.id ? -1 : 1),
);

/** How many autopsies the Codex holds pages for. */
export const CODEX_SIZE = CODEX_PUZZLES.length;

/** How many of the Codex's pages these clears have written. */
export function writtenCount(earned: readonly EarnedClear[]): number {
  const ids = new Set(earned.map((clear) => clear.puzzleId));
  return CODEX_PUZZLES.filter((puzzle) => ids.has(puzzle.id)).length;
}

/**
 * The Codex as a player sees it. An earned autopsy is rendered here, on the server, against the
 * night it was cleared on; an unearned one never leaves the server, since its text names the
 * technique the hour is about.
 */
export function codexEntries(earned: readonly EarnedClear[]): CodexEntry[] {
  const byPuzzle = new Map(earned.map((clear) => [clear.puzzleId, clear]));
  return CODEX_PUZZLES.map((puzzle): CodexEntry => {
    const pack = narrativePack(puzzle.id);
    const hour = {
      puzzleId: puzzle.id,
      title: pack.title,
      time: formatClock(slotDefinition(puzzle.slot).time),
    };
    const clear = byPuzzle.get(puzzle.id);
    if (!clear) return { ...hour, kind: "locked" };

    // The fog lifts once the hour is cleared, so the Codex keeps the real numbers; every other
    // curse changed the night itself, so it is worked back in.
    const setup = generateHour(puzzle, clear.seed, clear.curse === "fog" ? null : clear.curse);
    const bindings = {
      ...runBindings({
        seed: clear.seed,
        character: clear.character,
        candles: clear.candles,
        retention: setup.retention,
        checkpoints: setup.data.checkpoints,
      }),
      ...setup.data.narrative,
    };
    return {
      ...hour,
      kind: "written",
      seed: clear.seed,
      autopsy: renderAutopsy(pack, { bindings, withheld: [] }),
    };
  });
}

/**
 * The caller's Codex. A visitor with no session has earned nothing, so every page is locked.
 * Null when the session or database can't be read, so the page can say so instead of showing
 * a Codex emptier than the player's.
 */
export async function loadCodex(): Promise<CodexEntry[] | null> {
  try {
    const playerId = await currentPlayerId();
    return codexEntries(playerId ? await loadEarnedClears(db(), playerId) : []);
  } catch (error) {
    console.error("The Codex couldn't read this player's runs", error);
    return null;
  }
}
