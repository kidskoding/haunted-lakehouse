import "server-only";
import type { RelicId, RunState } from "../engine/run/types";
import { appendRunEvent } from "./append";
import { loadOwnedRunWith, runMachine, type OwnedRun, type RunDatabase } from "./load";

/**
 * Appends every event the game owes the run (the next hour's draw, or a relic offer) until it
 * waits on the player again, and returns the state it settles in.
 */
export async function settleRun(
  database: RunDatabase,
  runId: string,
  state: RunState,
): Promise<RunState> {
  let current = state;
  for (let next = runMachine.next(current); next; next = runMachine.next(current)) {
    current = runMachine.reduce(current, next);
    await appendRunEvent(database, runId, next, current);
  }
  return current;
}

export type AdvanceResult =
  | { readonly ok: true; readonly run: OwnedRun }
  | { readonly ok: false; readonly error: "not-found" | "not-choosing" | "not-offered" };

/** Moves an active run on to whatever it waits for next: a relic offer, or the next hour. */
export async function advanceRun(
  database: RunDatabase,
  runId: string,
  playerId: string,
): Promise<AdvanceResult> {
  const owned = await loadOwnedRunWith(database, runId, playerId);
  if (!owned) return { ok: false, error: "not-found" };
  return { ok: true, run: { ...owned, state: await settleRun(database, runId, owned.state) } };
}

/**
 * Takes one relic from the offer, or none when `relic` is null, then opens the next hour.
 * Only a relic actually on offer is accepted, whatever the client sends.
 */
export async function answerOffer(
  database: RunDatabase,
  runId: string,
  playerId: string,
  relic: string | null,
): Promise<AdvanceResult> {
  const owned = await loadOwnedRunWith(database, runId, playerId);
  if (!owned) return { ok: false, error: "not-found" };
  const { state } = owned;
  if (state.phase !== "choosing" || !state.offer) return { ok: false, error: "not-choosing" };
  if (relic !== null && !state.offer.some((offered) => offered === relic)) {
    return { ok: false, error: "not-offered" };
  }
  const event =
    relic === null
      ? ({ kind: "relic_declined" } as const)
      : ({ kind: "relic_chosen", relic: relic as RelicId } as const);
  const answered = runMachine.reduce(state, event);
  await appendRunEvent(database, runId, event, answered);
  return { ok: true, run: { ...owned, state: await settleRun(database, runId, answered) } };
}
