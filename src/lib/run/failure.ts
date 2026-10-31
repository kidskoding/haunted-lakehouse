import type { NightEvent, NightFailure } from "../executor/types";
import type { NightSchedule, NightVerdict } from "./night-timeline";

/**
 * The night's first failure as the browser can tell it from its own events and the server's
 * verdict: the runtime error or flinching replay at the revealed batch when there was one,
 * else the checkpoint the verdict names. The server never says which gold table differed, so
 * a wrong answer names every gold table the checkpoint read.
 */
export function failureFromVerdict(
  verdict: Extract<NightVerdict, { survived: false }>,
  events: readonly NightEvent[],
  schedule: NightSchedule,
  goldTables: readonly string[],
): NightFailure {
  const { revealedBatch } = verdict;
  for (const event of events) {
    if (event.kind === "error" && event.error.batch === revealedBatch) {
      return { kind: "error", error: event.error, revealedBatch };
    }
    if (
      event.kind === "replay" &&
      event.batch === revealedBatch &&
      Object.keys(event.before).some((table) => event.before[table] !== event.after[table])
    ) {
      return { kind: "replay", revealedBatch };
    }
  }
  const checkpoint = schedule.checkpoints.find((entry) => entry.id === verdict.checkpointId);
  return {
    kind: "checkpoint",
    checkpointId: verdict.checkpointId,
    label: checkpoint?.label ?? verdict.checkpointId,
    tables: [...goldTables].sort(),
    revealedBatch,
  };
}
