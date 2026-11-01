import "server-only";
import { eq } from "drizzle-orm";
import { dailyResults, runEvents, runs } from "../db/schema";
import type { RunEvent, RunState } from "../engine/run/types";
import { rowFromEvent } from "./events";
import type { RunExecutor } from "./load";

/** Maps engine run status onto the persisted `runs.status` column. */
export function persistedStatus(
  status: RunState["status"],
): "active" | "survived" | "dead" | "abandoned" {
  switch (status) {
    case "playing":
      return "active";
    case "dead":
      return "dead";
    case "abandoned":
      return "abandoned";
    case "won-act":
    case "victory":
    case "stranded":
      return "survived";
  }
}

/**
 * Thrown when an append loses a race: another writer already stored the event at this seq, so
 * the state this writer reduced from is stale.
 */
export class StaleRunError extends Error {
  constructor(runId: string, seq: number) {
    super(`Run ${runId} already has an event at seq ${String(seq)}.`);
    this.name = "StaleRunError";
  }
}

const SEQ_KEY = "run_events_run_id_seq_key";

function isSeqConflict(error: unknown): boolean {
  // Drizzle wraps the driver's error, so the Postgres fields sit on its cause.
  const cause: unknown = error instanceof Error && error.cause ? error.cause : error;
  return (
    cause !== null &&
    typeof cause === "object" &&
    "code" in cause &&
    cause.code === "23505" &&
    "constraint" in cause &&
    cause.constraint === SEQ_KEY
  );
}

/**
 * Appends one event at `seq`, the count of events the caller's state was replayed from, and
 * syncs the run row's status. The unique (run, seq) key turns a stale writer's append into a
 * {@link StaleRunError}. A Daily Haunt run that ends here also posts its result to that day's
 * board.
 */
export async function appendRunEvent(
  database: RunExecutor,
  runId: string,
  seq: number,
  event: RunEvent,
  state: RunState,
): Promise<void> {
  const { kind, payload } = rowFromEvent(event);
  const status = persistedStatus(state.status);

  try {
    await database.insert(runEvents).values({ runId, seq, kind, payload });
  } catch (error) {
    if (isSeqConflict(error)) throw new StaleRunError(runId, seq);
    throw error;
  }
  await database
    .update(runs)
    .set({
      status,
      endedAt: status === "active" ? null : new Date(),
    })
    .where(eq(runs.id, runId));
  if (status === "active") return;

  const [run] = await database
    .select({ playerId: runs.playerId, dailyDate: runs.dailyDate })
    .from(runs)
    .where(eq(runs.id, runId));
  if (!run?.dailyDate) return;
  await database
    .insert(dailyResults)
    .values({
      dailyDate: run.dailyDate,
      playerId: run.playerId,
      runId,
      slotsCleared: state.history.filter((hour) => hour.outcome === "cleared").length,
      candlesLeft: state.candles,
    })
    .onConflictDoNothing();
}
