import "server-only";
import { db } from "../db/client";
import { currentPlayerId } from "../session/session";
import { getBatch, listPreviewBatches, startNightAttempt } from "./access";

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
};

function errorResponse(error: string): Response {
  return Response.json({ error }, { status: ERROR_STATUS[error] ?? 400 });
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
