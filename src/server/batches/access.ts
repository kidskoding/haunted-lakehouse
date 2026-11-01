import "server-only";
import type { Batch, Puzzle, PuzzleData } from "../engine/puzzle";
import type { OpenHour, RunEvent, RunState } from "../engine/run/types";
import { appendRunEvent, StaleRunError } from "../runs/append";
import type { RunDatabase } from "../runs/load";
import { loadOwnedRunWith, runMachine } from "../runs/load";
import {
  NIGHT_ATTEMPT_TTL_SECONDS,
  signNightAttempt,
  verifyNightAttempt,
  type NightAttempt,
} from "./attempt";
import { openHourData } from "./hour";
import { previewBatches, serveBatch, type ServeBatchResult } from "./serve";

export type BatchAccessError =
  "unauthorized" | "not-found" | "no-open-hour" | "hidden" | "unknown-batch" | "stale";

export type PreviewResult =
  | {
      readonly ok: true;
      readonly puzzleId: string;
      readonly visibleBatchCount: number;
      readonly totalBatches: number;
      readonly batches: readonly Batch[];
    }
  | { readonly ok: false; readonly error: Exclude<BatchAccessError, "hidden" | "unknown-batch"> };

export type OneBatchResult =
  | { readonly ok: true; readonly batch: Batch }
  | { readonly ok: false; readonly error: BatchAccessError };

export type NightAttemptResult =
  | { readonly ok: true; readonly attemptToken: string; readonly expiresAt: number }
  | {
      readonly ok: false;
      readonly error: Exclude<BatchAccessError, "hidden" | "unknown-batch">;
    };

async function hourFor(
  database: RunDatabase,
  runId: string,
  playerId: string,
): Promise<
  | {
      readonly ok: true;
      readonly puzzle: Puzzle;
      readonly data: PuzzleData;
      readonly hour: OpenHour;
      readonly revealed: readonly number[];
      readonly state: RunState;
      readonly nextSeq: number;
    }
  | { readonly ok: false; readonly error: Exclude<BatchAccessError, "hidden" | "unknown-batch"> }
> {
  const owned = await loadOwnedRunWith(database, runId, playerId);
  if (!owned) return { ok: false, error: "not-found" };
  const open = openHourData(owned.state);
  if (!open) return { ok: false, error: "no-open-hour" };
  return {
    ok: true,
    puzzle: open.puzzle,
    data: open.data,
    hour: open.hour,
    revealed: open.hour.revealed,
    state: owned.state,
    nextSeq: owned.nextSeq,
  };
}

/** Visible and revealed batches for the player's open hour. Never includes hidden landings. */
export async function listPreviewBatches(
  database: RunDatabase,
  runId: string,
  playerId: string,
): Promise<PreviewResult> {
  const hour = await hourFor(database, runId, playerId);
  if (!hour.ok) return hour;
  return {
    ok: true,
    puzzleId: hour.puzzle.id,
    visibleBatchCount: hour.puzzle.visibleBatchCount,
    totalBatches: hour.data.batches.length,
    batches: previewBatches(hour.puzzle, hour.data, hour.revealed),
  };
}

/**
 * One batch by index. A hidden batch is served only when `attemptToken` verifies as the open
 * night attempt for this player, run, and puzzle.
 */
export async function getBatch(
  database: RunDatabase,
  input: {
    readonly runId: string;
    readonly playerId: string;
    readonly index: number;
    readonly attemptToken: string | null;
    readonly now: number;
    readonly secret: string;
  },
): Promise<OneBatchResult> {
  const hour = await hourFor(database, input.runId, input.playerId);
  if (!hour.ok) return hour;

  let nightAttempt = false;
  if (input.attemptToken) {
    const attempt = await verifyNightAttempt(input.attemptToken, input.now, input.secret);
    nightAttempt = isOpenAttempt(attempt, input.playerId, input.runId, hour.puzzle.id, hour.hour);
  }

  const served: ServeBatchResult = serveBatch(
    hour.puzzle,
    hour.data,
    hour.revealed,
    input.index,
    nightAttempt,
  );
  if (!served.ok) return { ok: false, error: served.reason };
  return { ok: true, batch: served.batch };
}

/**
 * Opens a short-lived night attempt for the player's current hour and records it as
 * `attempt_started`. An attempt still open was given the hidden night and never judged, so it
 * is recorded as broken first, at the cost of its candle: walking away from a night that
 * looked bad is no cheaper than failing it.
 */
export async function startNightAttempt(
  database: RunDatabase,
  input: {
    readonly runId: string;
    readonly playerId: string;
    readonly now: number;
    readonly secret: string;
  },
): Promise<NightAttemptResult> {
  const hour = await hourFor(database, input.runId, input.playerId);
  if (!hour.ok) return hour;

  const steps: { event: RunEvent; state: RunState }[] = [];
  let state = hour.state;
  const record = (event: RunEvent) => {
    state = runMachine.reduce(state, event);
    steps.push({ event, state });
  };
  if (hour.hour.openAttempt !== null) {
    const first = hour.data.checkpoints[0];
    if (!first) throw new Error(`${hour.puzzle.id} has no checkpoints.`);
    record({
      kind: "attempt_failed",
      slot: hour.hour.slot,
      checkpointId: first.id,
      revealedBatch: null,
    });
  }
  const attemptId = crypto.randomUUID();
  if (state.status === "playing") {
    record({ kind: "attempt_started", slot: hour.hour.slot, attemptId });
  }

  try {
    await database.transaction(async (tx) => {
      for (const [offset, step] of steps.entries()) {
        await appendRunEvent(tx, input.runId, hour.nextSeq + offset, step.event, step.state);
      }
    });
  } catch (error) {
    if (error instanceof StaleRunError) return { ok: false, error: "stale" };
    throw error;
  }
  // The abandoned attempt took the last candle, so there is no night left to run.
  if (state.status !== "playing") return { ok: false, error: "no-open-hour" };

  const expiresAt = input.now + NIGHT_ATTEMPT_TTL_SECONDS;
  const attemptToken = await signNightAttempt(
    {
      playerId: input.playerId,
      runId: input.runId,
      puzzleId: hour.puzzle.id,
      attemptId,
      expiresAt,
    },
    input.secret,
  );
  return { ok: true, attemptToken, expiresAt };
}

/** Whether a verified token is the hour's open attempt, for this player, run, and puzzle. */
export function isOpenAttempt(
  attempt: NightAttempt | null,
  playerId: string,
  runId: string,
  puzzleId: string,
  hour: OpenHour,
): boolean {
  return (
    attempt !== null &&
    attempt.playerId === playerId &&
    attempt.runId === runId &&
    attempt.puzzleId === puzzleId &&
    attempt.attemptId === hour.openAttempt
  );
}
