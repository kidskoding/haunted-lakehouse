import "server-only";
import type { RunEvent, RunEventKind } from "../engine/run/types";

const KINDS = new Set<RunEventKind>([
  "run_started",
  "hour_opened",
  "pool_exhausted",
  "attempt_failed",
  "hour_cleared",
  "hour_skipped",
  "relic_offered",
  "relic_chosen",
  "relic_declined",
  "relic_used",
  "run_abandoned",
]);

/**
 * Rebuilds a {@link RunEvent} from a stored `run_events` row. The kind lives in its own
 * column; everything else is the JSON payload. An `attempt_failed` stored before reveals
 * were recorded reads as revealing nothing, which is what the server served then.
 */
export function eventFromRow(kind: string, payload: unknown): RunEvent {
  if (!KINDS.has(kind as RunEventKind)) {
    throw new Error(`Unknown run event kind ${kind}.`);
  }
  if (payload === null || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error(`Run event ${kind} needs an object payload.`);
  }
  if ("kind" in payload) {
    throw new Error(`Run event ${kind} payload must not repeat the kind.`);
  }
  if (kind === "attempt_failed") {
    const revealedBatch = "revealedBatch" in payload ? payload.revealedBatch : null;
    return {
      kind,
      ...payload,
      revealedBatch: Number.isInteger(revealedBatch) ? revealedBatch : null,
    } as RunEvent;
  }
  return { kind, ...payload } as RunEvent;
}

/** Splits a {@link RunEvent} into the columns `run_events` stores. */
export function rowFromEvent(event: RunEvent): {
  kind: RunEventKind;
  payload: Record<string, unknown>;
} {
  const { kind, ...payload } = event;
  return { kind, payload };
}
