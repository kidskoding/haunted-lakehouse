import "server-only";
import type { NightEvent } from "../../lib/executor/types";
import { db } from "../db/client";
import { currentPlayerId } from "../session/session";
import { getBatch, listPreviewBatches, startNightAttempt } from "./access";
import { judgeNightAttempt } from "./judge";
import { parseNightEvents } from "./validate";

function sessionSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    throw new Error("SESSION_SECRET is not set. See .env.example.");
  }
  return secret;
}

function nowSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

const ERROR_STATUS: Record<string, number> = {
  unauthorized: 401,
  "not-found": 404,
  "no-open-hour": 409,
  hidden: 403,
  "unknown-batch": 404,
  "invalid-attempt": 403,
  "invalid-body": 400,
  "invalid-night": 422,
};

function errorResponse(error: string): Response {
  return Response.json({ error }, { status: ERROR_STATUS[error] ?? 400 });
}

function parseJudgeBody(
  body: unknown,
): { attemptToken: string; events: readonly NightEvent[] } | null {
  if (body === null || typeof body !== "object" || Array.isArray(body)) return null;
  const { attemptToken, events } = body as Record<string, unknown>;
  if (typeof attemptToken !== "string" || attemptToken.length === 0) return null;
  const parsed = parseNightEvents(events);
  return parsed ? { attemptToken, events: parsed } : null;
}

/** GET the visible batches for the caller's open hour on this run. */
export async function handleListBatches(runId: string): Promise<Response> {
  const playerId = await currentPlayerId();
  if (!playerId) return errorResponse("unauthorized");
  const result = await listPreviewBatches(db(), runId, playerId);
  if (!result.ok) return errorResponse(result.error);
  return Response.json({
    puzzleId: result.puzzleId,
    visibleBatchCount: result.visibleBatchCount,
    totalBatches: result.totalBatches,
    batches: result.batches,
  });
}

/** GET one batch; pass `attemptToken` from the night-attempt route to unlock hidden ones. */
export async function handleGetBatch(
  runId: string,
  index: number,
  attemptToken: string | null,
): Promise<Response> {
  const playerId = await currentPlayerId();
  if (!playerId) return errorResponse("unauthorized");
  if (!Number.isInteger(index) || index < 0) return errorResponse("unknown-batch");
  const result = await getBatch(db(), {
    runId,
    playerId,
    index,
    attemptToken,
    now: nowSeconds(),
    secret: sessionSecret(),
  });
  if (!result.ok) return errorResponse(result.error);
  return Response.json({ batch: result.batch });
}

/** POST to open a short-lived night attempt that unlocks hidden batches for this hour. */
export async function handleStartNightAttempt(runId: string): Promise<Response> {
  const playerId = await currentPlayerId();
  if (!playerId) return errorResponse("unauthorized");
  const result = await startNightAttempt(db(), {
    runId,
    playerId,
    now: nowSeconds(),
    secret: sessionSecret(),
  });
  if (!result.ok) return errorResponse(result.error);
  return Response.json(
    { attemptToken: result.attemptToken, expiresAt: result.expiresAt },
    { status: 201 },
  );
}

/**
 * POST the events of a night attempt. On a miss, returns only the first checkpoint not
 * passed, the revealed batch, and what is now visible (never expected rows or which tables
 * differed).
 */
export async function handleJudgeNight(runId: string, request: Request): Promise<Response> {
  const playerId = await currentPlayerId();
  if (!playerId) return errorResponse("unauthorized");

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errorResponse("invalid-body");
  }
  const parsed = parseJudgeBody(body);
  if (!parsed) return errorResponse("invalid-body");

  const result = await judgeNightAttempt(db(), {
    runId,
    playerId,
    attemptToken: parsed.attemptToken,
    events: parsed.events,
    now: nowSeconds(),
    secret: sessionSecret(),
  });
  if (!result.ok) return errorResponse(result.error);

  if (result.survived) {
    return Response.json({
      survived: true,
      candles: result.candles,
      status: result.status,
      phase: result.phase,
      unlocks: result.unlocks,
    });
  }
  return Response.json({
    survived: false,
    checkpointId: result.checkpointId,
    revealedBatch: result.revealedBatch,
    visible: result.visible,
    candles: result.candles,
    status: result.status,
    phase: result.phase,
    unlocks: result.unlocks,
  });
}
