import "server-only";
import { and, eq } from "drizzle-orm";
import { db } from "../db/client";
import { runs } from "../db/schema";
import { ensurePlayerRow } from "../runs/create";
import { currentPlayerId } from "../session/session";
import { isPageId } from "./catalog";
import { grantFragment, loadPlayerUnlocks } from "./store";

const ERROR_STATUS: Record<string, number> = {
  unauthorized: 401,
  "invalid-body": 400,
  "unknown-fragment": 400,
  "not-found": 404,
};

function errorResponse(error: string): Response {
  return Response.json({ error }, { status: ERROR_STATUS[error] ?? 400 });
}

/** GET the caller's act gates, characters, endings, and ledger pages. */
export async function handleGetUnlocks(): Promise<Response> {
  const playerId = await currentPlayerId();
  if (!playerId) return errorResponse("unauthorized");
  const progress = await loadPlayerUnlocks(await db(), playerId);
  return Response.json(progress);
}

/**
 * POST a ledger page the player found in a run's data. Body: `{ fragmentId, runId? }`.
 * Idempotent: a page already held returns `{ granted: false }`.
 */
export async function handleGrantFragment(request: Request): Promise<Response> {
  const playerId = await currentPlayerId();
  if (!playerId) return errorResponse("unauthorized");

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errorResponse("invalid-body");
  }
  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    return errorResponse("invalid-body");
  }
  const { fragmentId, runId } = body as Record<string, unknown>;
  if (typeof fragmentId !== "string" || !isPageId(fragmentId)) {
    return errorResponse("unknown-fragment");
  }
  if (runId !== undefined && runId !== null && typeof runId !== "string") {
    return errorResponse("invalid-body");
  }

  const database = await db();
  let findingRunId: string | null = null;
  if (typeof runId === "string") {
    const [owned] = await database
      .select({ id: runs.id })
      .from(runs)
      .where(and(eq(runs.id, runId), eq(runs.playerId, playerId)))
      .limit(1);
    if (!owned) return errorResponse("not-found");
    findingRunId = owned.id;
  }

  // A session cookie alone has no players row yet, and fragments hang off one.
  await ensurePlayerRow(database, playerId);
  const granted = await grantFragment(database, playerId, fragmentId, findingRunId);
  return Response.json({ granted, fragmentId }, { status: granted ? 201 : 200 });
}
