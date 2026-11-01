import "server-only";
import { and, asc, eq } from "drizzle-orm";
import { db, type RunDatabase, type RunExecutor } from "../db/client";
import { runEvents, runs } from "../db/schema";
import { ALL_PUZZLES } from "../engine/puzzles";
import { createPuzzleRegistry } from "../engine/registry";
import { createRunMachine } from "../engine/run/reducer";
import type { RunState } from "../engine/run/types";
import { eventFromRow } from "./events";

const registry = createPuzzleRegistry(ALL_PUZZLES);
const machine = createRunMachine(registry);

export type { RunDatabase, RunExecutor };

export interface OwnedRun {
  readonly id: string;
  readonly playerId: string;
  readonly seed: string;
  readonly status: "active" | "survived" | "dead" | "abandoned";
  readonly state: RunState;
  /** The seq the next event takes: how many events the log held when the run was read. */
  readonly nextSeq: number;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Whether an id from a URL or request body can name a row. Postgres rejects a malformed uuid
 * with an error, not an empty result, so callers check before they query.
 */
export function isUuid(id: string): boolean {
  return UUID.test(id);
}

/**
 * Loads a run the player owns, in any status, and replays its event log. Returns null when the
 * run is missing or belongs to someone else.
 */
export async function loadPlayerRunWith(
  database: RunDatabase,
  runId: string,
  playerId: string,
): Promise<OwnedRun | null> {
  if (!isUuid(runId)) return null;
  const [run] = await database
    .select()
    .from(runs)
    .where(and(eq(runs.id, runId), eq(runs.playerId, playerId)))
    .limit(1);
  if (!run) return null;

  const rows = await database
    .select({ kind: runEvents.kind, payload: runEvents.payload })
    .from(runEvents)
    .where(eq(runEvents.runId, runId))
    .orderBy(asc(runEvents.seq));

  const events = rows.map((row) => eventFromRow(row.kind, row.payload));
  return {
    id: run.id,
    playerId: run.playerId,
    seed: run.seed,
    status: run.status,
    state: machine.replay(events),
    nextSeq: events.length,
  };
}

/**
 * Loads an active run the player owns and replays its event log. Returns null when the run
 * is missing, belongs to someone else, or is no longer active.
 */
export async function loadOwnedRunWith(
  database: RunDatabase,
  runId: string,
  playerId: string,
): Promise<OwnedRun | null> {
  const run = await loadPlayerRunWith(database, runId, playerId);
  return run?.status === "active" ? run : null;
}

/** {@link loadOwnedRunWith} against the shared database. */
export async function loadOwnedRun(runId: string, playerId: string): Promise<OwnedRun | null> {
  return loadOwnedRunWith(await db(), runId, playerId);
}

export { machine as runMachine, registry as puzzleRegistry };
