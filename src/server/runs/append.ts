import "server-only";
import { eq, max } from "drizzle-orm";
import { runEvents, runs } from "../db/schema";
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

/** Appends one event at the next sequence number and syncs the run row's status. */
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
}
