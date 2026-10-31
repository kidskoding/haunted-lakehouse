import "server-only";
import type { RunEvent, RunState } from "../engine/run/types";
import { appendRunEvent } from "../runs/append";
import type { RunDatabase } from "../runs/load";
import { loadOwnedRunWith, runMachine } from "../runs/load";
import { verifyNightAttempt } from "./attempt";
import { expectedHashes } from "./expected";
import { openHourData } from "./hour";
import { validateNight, type SubmittedHashes } from "./validate";

export type JudgeError = "unauthorized" | "not-found" | "no-open-hour" | "invalid-attempt";

export type JudgeResult =
  | {
      readonly ok: true;
      readonly survived: true;
      readonly candles: number;
      readonly status: RunState["status"];
      readonly phase: RunState["phase"];
    }
  | {
      readonly ok: true;
      readonly survived: false;
      readonly checkpointId: string;
      readonly revealedBatch: number;
      readonly candles: number;
      readonly status: RunState["status"];
      readonly phase: RunState["phase"];
    }
  | { readonly ok: false; readonly error: JudgeError };

/**
 * Judges a run-the-night submission: verify the attempt token, compare hashes in checkpoint
 * order, append `hour_cleared` or `attempt_failed`, and return only the first miss.
 */
export async function judgeNightAttempt(
  database: RunDatabase,
  input: {
    readonly runId: string;
    readonly playerId: string;
    readonly attemptToken: string;
    readonly checkpoints: SubmittedHashes;
    readonly now: number;
    readonly secret: string;
  },
): Promise<JudgeResult> {
  const owned = await loadOwnedRunWith(database, input.runId, input.playerId);
  if (!owned) return { ok: false, error: "not-found" };

  const open = openHourData(owned.state);
  if (!open) return { ok: false, error: "no-open-hour" };

  const attempt = await verifyNightAttempt(input.attemptToken, input.now, input.secret);
  if (
    !attempt ||
    attempt.playerId !== input.playerId ||
    attempt.runId !== input.runId ||
    attempt.puzzleId !== open.puzzle.id
  ) {
    return { ok: false, error: "invalid-attempt" };
  }

  const expected = await expectedHashes(open.data);
  const verdict = validateNight(open.data.checkpoints, expected, input.checkpoints);
  const slot = open.hour.slot;

  const event: RunEvent = verdict.survived
    ? { kind: "hour_cleared", slot }
    : { kind: "attempt_failed", slot, checkpointId: verdict.checkpointId };

  const next = runMachine.reduce(owned.state, event);
  await appendRunEvent(database, input.runId, event, next);

  if (verdict.survived) {
    return {
      ok: true,
      survived: true,
      candles: next.candles,
      status: next.status,
      phase: next.phase,
    };
  }
  return {
    ok: true,
    survived: false,
    checkpointId: verdict.checkpointId,
    revealedBatch: verdict.revealedBatch,
    candles: next.candles,
    status: next.status,
    phase: next.phase,
  };
}
