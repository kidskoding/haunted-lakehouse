import "server-only";
import { asc, eq } from "drizzle-orm";
import { runEvents, runs } from "../db/schema";
import type { CharacterId, CurseId, RunState } from "../engine/run/types";
import { eventFromRow } from "../runs/events";
import { runMachine, type RunDatabase } from "../runs/load";

/** One cleared hour: enough to rebuild the night it was cleared on and render its autopsy. */
export interface EarnedClear {
  readonly puzzleId: string;
  readonly seed: string;
  readonly character: CharacterId;
  readonly curse: CurseId | null;
  /** Candles left the moment the hour was cleared. */
  readonly candles: number;
}

/**
 * The autopsies a player has earned, one per puzzle, from every run's event log: each puzzle
 * the player has cleared, with the latest night they cleared it on. A skipped hour (the Black
 * Cat) closes without a clear, so it earns nothing.
 */
export async function loadEarnedClears(
  database: RunDatabase,
  playerId: string,
): Promise<EarnedClear[]> {
  const rows = await database
    .select({
      runId: runEvents.runId,
      kind: runEvents.kind,
      payload: runEvents.payload,
    })
    .from(runEvents)
    .innerJoin(runs, eq(runEvents.runId, runs.id))
    .where(eq(runs.playerId, playerId))
    .orderBy(asc(runs.createdAt), asc(runs.id), asc(runEvents.seq));

  const earned = new Map<string, EarnedClear>();
  let runId: string | null = null;
  let state: RunState | null = null;
  for (const row of rows) {
    const event = eventFromRow(row.kind, row.payload);
    if (row.runId !== runId) {
      runId = row.runId;
      state = null;
    }
    // The reducer checks every event as it would on append, so the clear is the one the run saw.
    const before: RunState | null = state;
    state = before === null ? runMachine.replay([event]) : runMachine.reduce(before, event);
    if (event.kind === "hour_cleared" && before?.hour) {
      earned.set(before.hour.puzzleId, {
        puzzleId: before.hour.puzzleId,
        seed: state.seed,
        character: state.character,
        curse: before.hour.curse,
        candles: state.candles,
      });
    }
  }
  return [...earned.values()];
}
