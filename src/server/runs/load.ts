import "server-only";
import { and, asc, eq } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type { PgliteDatabase } from "drizzle-orm/pglite";
import { db } from "../db/client";
import * as schema from "../db/schema";
import { runEvents, runs } from "../db/schema";
import { ALL_PUZZLES } from "../engine/puzzles";
import { createPuzzleRegistry } from "../engine/registry";
import { createRunMachine } from "../engine/run/reducer";
import type { RunState } from "../engine/run/types";
import { eventFromRow } from "./events";

const registry = createPuzzleRegistry(ALL_PUZZLES);
const machine = createRunMachine(registry);

/** Either Postgres driver the app or its PGlite tests bind to the schema. */
export type RunDatabase = NodePgDatabase<typeof schema> | PgliteDatabase<typeof schema>;

export interface OwnedRun {
  readonly id: string;
  readonly playerId: string;
  readonly seed: string;
  readonly status: "active" | "survived" | "dead" | "abandoned";
  readonly state: RunState;
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
  const [run] = await database
    .select()
    .from(runs)
    .where(and(eq(runs.id, runId), eq(runs.playerId, playerId), eq(runs.status, "active")))
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
  };
}

/** {@link loadOwnedRunWith} against the shared Postgres pool. */
export async function loadOwnedRun(runId: string, playerId: string): Promise<OwnedRun | null> {
  return loadOwnedRunWith(db(), runId, playerId);
}

export { machine as runMachine, registry as puzzleRegistry };
