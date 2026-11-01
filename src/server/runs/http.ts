import "server-only";
import { eq } from "drizzle-orm";
import { dailyToday } from "../daily/daily";
import { db, type RunDatabase } from "../db/client";
import { players } from "../db/schema";
import { currentPlayerId, ensurePlayerId } from "../session/session";
import { loadPlayerUnlocks } from "../unlocks/store";
import { advanceRun, answerOffer } from "./advance";
import { createRun } from "./create";
import { loadPlayerRunWith, type OwnedRun } from "./load";
import { runView } from "./view";

const ERROR_STATUS: Record<string, number> = {
  unauthorized: 401,
  "invalid-body": 400,
  "invalid-character": 400,
  "invalid-seed": 400,
  "locked-character": 403,
  "daily-taken": 409,
  "not-found": 404,
  "not-choosing": 409,
  "not-offered": 409,
  stale: 409,
};

function errorResponse(error: string): Response {
  return Response.json({ error }, { status: ERROR_STATUS[error] ?? 400 });
}

async function readObject(request: Request): Promise<Record<string, unknown> | null> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return null;
  }
  return body !== null && typeof body === "object" && !Array.isArray(body)
    ? (body as Record<string, unknown>)
    : null;
}

async function viewResponse(database: RunDatabase, run: OwnedRun, status = 200): Promise<Response> {
  const [player] = await database
    .select({ login: players.githubLogin })
    .from(players)
    .where(eq(players.id, run.playerId))
    .limit(1);
  const unlocks = await loadPlayerUnlocks(database, run.playerId);
  return Response.json(runView(run, { handle: player?.login ?? null, unlocks }), { status });
}

/**
 * POST a new run. Body: `{ character, seed?, daily? }`; a missing or empty seed draws a fresh
 * one, and `daily: true` plays today's Daily Haunt, dated by the server's clock.
 * Starts an anonymous session when there is none, and answers with the run's view.
 */
export async function handleCreateRun(request: Request): Promise<Response> {
  const body = await readObject(request);
  if (!body) return errorResponse("invalid-body");
  const { character, seed, daily } = body;
  if (typeof character !== "string") return errorResponse("invalid-character");
  if (seed !== undefined && seed !== null && typeof seed !== "string") {
    return errorResponse("invalid-seed");
  }
  if (daily !== undefined && typeof daily !== "boolean") return errorResponse("invalid-body");

  const { playerId } = await ensurePlayerId();
  const database = await db();
  const created = await createRun(database, {
    playerId,
    character,
    seed: seed === undefined || seed === null || seed === "" ? null : seed,
    dailyDate: daily === true ? dailyToday(new Date()).date : null,
  });
  if (!created.ok) return errorResponse(created.error);
  const run = await loadPlayerRunWith(database, created.runId, playerId);
  if (!run) throw new Error("A run just created could not be read back.");
  return viewResponse(database, run, 201);
}

/** GET the run screen's view of one of the caller's runs, in any status. */
export async function handleGetRun(runId: string): Promise<Response> {
  const playerId = await currentPlayerId();
  if (!playerId) return errorResponse("unauthorized");
  const database = await db();
  const run = await loadPlayerRunWith(database, runId, playerId);
  if (!run) return errorResponse("not-found");
  return viewResponse(database, run);
}

/** POST to move the run on to what it waits for next: the relic offer, or the next hour. */
export async function handleAdvanceRun(runId: string): Promise<Response> {
  const playerId = await currentPlayerId();
  if (!playerId) return errorResponse("unauthorized");
  const database = await db();
  const result = await advanceRun(database, runId, playerId);
  if (!result.ok) return errorResponse(result.error);
  return viewResponse(database, result.run);
}

/** POST the answer to a relic offer. Body: `{ relic }`, null to take none. */
export async function handleAnswerOffer(runId: string, request: Request): Promise<Response> {
  const playerId = await currentPlayerId();
  if (!playerId) return errorResponse("unauthorized");
  const body = await readObject(request);
  if (!body || !(body.relic === null || typeof body.relic === "string")) {
    return errorResponse("invalid-body");
  }
  const database = await db();
  const result = await answerOffer(database, runId, playerId, body.relic);
  if (!result.ok) return errorResponse(result.error);
  return viewResponse(database, result.run);
}
