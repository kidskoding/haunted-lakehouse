import "server-only";
import { eq, max } from "drizzle-orm";
import { dailyResults, runEvents, runs } from "../db/schema";
import type { RunEvent, RunState } from "../engine/run/types";
import { rowFromEvent } from "./events";
import type { RunDatabase } from "./load";

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
 * Appends one event at the next sequence number and syncs the run row's status. A Daily Haunt
 * run that ends here also posts its result to that day's board.
 */
export async function appendRunEvent(
  database: RunDatabase,
  runId: string,
  event: RunEvent,
  state: RunState,
): Promise<void> {
  const [aggregate] = await database
    .select({ next: max(runEvents.seq) })
    .from(runEvents)
    .where(eq(runEvents.runId, runId));
  const seq = (aggregate?.next ?? -1) + 1;
  const { kind, payload } = rowFromEvent(event);
  const status = persistedStatus(state.status);

  await database.insert(runEvents).values({ runId, seq, kind, payload });
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
