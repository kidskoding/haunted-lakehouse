import "server-only";
import { dailyAttemptWith } from "../daily/daily";
import { players, runs } from "../db/schema";
import { isCharacterId } from "../engine/run/characters";
import type { RunEvent, RunState } from "../engine/run/types";
import { rngFor } from "../engine/random";
import { dailySeed, humanSeed, isHumanSeed } from "../engine/seed";
import { loadPlayerUnlocks } from "../unlocks/store";
import { runConfigFor } from "../unlocks/progress";
import { appendRunEvent } from "./append";
import { settleRun } from "./advance";
import { runMachine, type RunDatabase } from "./load";

export type CreateRunError =
  "invalid-character" | "invalid-seed" | "locked-character" | "daily-taken";

export type CreateRunResult =
  | { readonly ok: true; readonly runId: string; readonly state: RunState }
  | { readonly ok: false; readonly error: CreateRunError };

/** A fresh seed for a run the player didn't name one for. Random on purpose: it is the run's root. */
export function drawSeed(): string {
  return humanSeed(rngFor(["@new-run", crypto.randomUUID(), 0]));
}

/** Gives the session's player id a `players` row, the parent of every run and unlock. */
export async function ensurePlayerRow(database: RunDatabase, playerId: string): Promise<void> {
  await database.insert(players).values({ id: playerId }).onConflictDoNothing();
}

/**
 * Starts a run for a player: checks the character is theirs to pick and the seed is one the
 * generator could have drawn, then records `run_started` and opens the first hour. A Daily
 * Haunt run (`dailyDate` set) plays that date's seed, whatever `seed` says, and only as the
 * player's first attempt at it.
 */
export async function createRun(
  database: RunDatabase,
  input: {
    readonly playerId: string;
    readonly character: string;
    readonly seed: string | null;
    readonly dailyDate?: string | null;
  },
): Promise<CreateRunResult> {
  const dailyDate = input.dailyDate ?? null;
  if (!isCharacterId(input.character)) return { ok: false, error: "invalid-character" };
  if (dailyDate === null && input.seed !== null && !isHumanSeed(input.seed)) {
    return { ok: false, error: "invalid-seed" };
  }

  await ensurePlayerRow(database, input.playerId);
  if (dailyDate !== null) {
    const attempt = await dailyAttemptWith(database, input.playerId, dailyDate);
    if (attempt.kind !== "none") return { ok: false, error: "daily-taken" };
  }
  const unlocks = await loadPlayerUnlocks(database, input.playerId);
  const seed = dailyDate === null ? (input.seed ?? drawSeed()) : dailySeed(dailyDate);
  const config = runConfigFor(unlocks, seed, input.character);
  if (!config) return { ok: false, error: "locked-character" };

  // The unique (player, daily date) key settles two first attempts racing each other.
  const [run] = await database
    .insert(runs)
    .values({ playerId: input.playerId, seed: config.seed, character: config.character, dailyDate })
    .onConflictDoNothing()
    .returning();
  if (!run) {
    if (dailyDate !== null) return { ok: false, error: "daily-taken" };
    throw new Error("The run row was not created.");
  }

  const started: RunEvent = { kind: "run_started", ...config };
  const state = runMachine.replay([started]);
  await appendRunEvent(database, run.id, started, state);
  return { ok: true, runId: run.id, state: await settleRun(database, run.id, state) };
}
