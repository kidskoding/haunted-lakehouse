import "server-only";
import type { NightEvent } from "../../lib/executor/types";
import type { RunEvent, RunState } from "../engine/run/types";
import { appendRunEvent } from "../runs/append";
import type { RunDatabase } from "../runs/load";
import { loadOwnedRunWith, runMachine } from "../runs/load";
import { applyUnlocksAfterReduce } from "../unlocks/apply";
import type { UnlockAward } from "../unlocks/catalog";
import { verifyNightAttempt } from "./attempt";
import { expectedHashes } from "./expected";
import { openHourData } from "./hour";
import { validateNight } from "./validate";

export type JudgeError =
  "unauthorized" | "not-found" | "no-open-hour" | "invalid-attempt" | "invalid-night";

export type JudgeResult =
  | {
      readonly ok: true;
      readonly survived: true;
      readonly candles: number;
      readonly status: RunState["status"];
      readonly phase: RunState["phase"];
      readonly unlocks: readonly UnlockAward[];
    }
  | {
      readonly ok: true;
      readonly survived: false;
      readonly checkpointId: string;
      readonly revealedBatch: number;
      /** Every batch the player can query now, the revealed one included. */
      readonly visible: readonly number[];
      readonly candles: number;
      readonly status: RunState["status"];
      readonly phase: RunState["phase"];
      readonly unlocks: readonly UnlockAward[];
    }
  | { readonly ok: false; readonly error: JudgeError };

/**
 * Judges a run-the-night submission: verify the attempt token, check the events are a night
 * this hour could produce, judge them as the client does, append `hour_cleared` or
 * `attempt_failed`, and return only where the night first broke.
 */
export async function judgeNightAttempt(
  database: RunDatabase,
  input: {
    readonly runId: string;
    readonly playerId: string;
    readonly attemptToken: string;
    /** Every event the client's Run the night yielded, in timeline order. */
    readonly events: readonly NightEvent[];
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

  const expected = await expectedHashes(open.puzzle, open.data);
  const verdict = validateNight(open, expected, input.events);
  if (!verdict) return { ok: false, error: "invalid-night" };
  const slot = open.hour.slot;

  const event: RunEvent = verdict.survived
    ? { kind: "hour_cleared", slot }
    : {
        kind: "attempt_failed",
        slot,
        checkpointId: verdict.checkpointId,
        revealedBatch: verdict.revealedBatch,
      };

  const next = runMachine.reduce(owned.state, event);
  await appendRunEvent(database, input.runId, event, next);
  const unlocks = verdict.survived
    ? await applyUnlocksAfterReduce(database, input.playerId, owned.state, next)
    : [];

  if (verdict.survived) {
    return {
      ok: true,
      survived: true,
      candles: next.candles,
      status: next.status,
      phase: next.phase,
      unlocks,
    };
  }
  return {
    ok: true,
    survived: false,
    checkpointId: verdict.checkpointId,
    revealedBatch: verdict.revealedBatch,
    visible: verdict.visible,
    candles: next.candles,
    status: next.status,
    phase: next.phase,
    unlocks,
  };
}
