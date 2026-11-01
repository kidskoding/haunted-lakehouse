import "server-only";
import type { Batch, Puzzle, PuzzleData } from "../puzzle";
import type { RunMachine } from "../run/reducer";
import type { RelicId, RelicUse, RunEvent, RunState } from "../run/types";
import { RelicError } from "./errors";
import { expectHidden, peekBatch } from "./feather";
import { expectedRowCount, nextCheckpoint, type RowCount } from "./hourglass";
import { schemaHistory, type SchemaHistory } from "./lantern";

/** What the server knows about the open hour when a relic is used. */
export interface HourIntel {
  readonly puzzle: Puzzle;
  readonly data: PuzzleData;
  /** How many batches, from the first, the player can already query in bronze. */
  readonly visibleBatchCount: number;
}

/**
 * A player's request to use a relic, naming what to point it at. The Hourglass names only a
 * table: it always looks at the next checkpoint. The Black Cat and Spare Candle are accepted
 * here only to be refused, since they never reveal anything.
 */
export type RelicRequest =
  | { readonly relic: "wrens-lantern"; readonly feed: string }
  | { readonly relic: "ravens-feather"; readonly batch: number }
  | { readonly relic: "hourglass"; readonly table: string }
  | { readonly relic: Extract<RelicId, "black-cat" | "spare-candle"> };

/** Engineering intel a relic hands the player. Never rows of an expected answer. */
export type RelicReveal =
  | { readonly relic: "wrens-lantern"; readonly history: SchemaHistory }
  | { readonly relic: "ravens-feather"; readonly batch: Batch }
  | { readonly relic: "hourglass"; readonly count: RowCount };

export interface RelicOutcome {
  /** The run with the relic spent. */
  readonly state: RunState;
  /** The event to store, carrying the target so the reveal can be rebuilt from it. */
  readonly event: Extract<RunEvent, { kind: "relic_used" }>;
  readonly reveal: RelicReveal;
}

function targetOf(state: RunState, intel: HourIntel, request: RelicRequest): RelicUse {
  switch (request.relic) {
    // Rebuilt field by field, so nothing else a request carries ends up in the stored event.
    case "wrens-lantern":
      return { relic: request.relic, feed: request.feed };
    case "ravens-feather":
      return { relic: request.relic, batch: request.batch };
    case "hourglass": {
      const failures = state.hour?.failures ?? [];
      const { id } = nextCheckpoint(failures, intel.data);
      return { relic: "hourglass", table: request.table, checkpointId: id };
    }
    case "black-cat":
      throw new RelicError("not-targeted", "The Black Cat is used by skipping the hour.");
    case "spare-candle":
      throw new RelicError("not-targeted", "A Spare Candle is lit the moment it's chosen.");
  }
}

/**
 * Rebuilds what a stored `relic_used` event revealed, from its target and the hour's data.
 * It checks only that the target exists, since a batch hidden at the time of use may be
 * visible by now.
 */
export function revealOf(use: RelicUse, intel: Pick<HourIntel, "puzzle" | "data">): RelicReveal {
  const { puzzle, data } = intel;
  switch (use.relic) {
    case "wrens-lantern":
      return { relic: use.relic, history: schemaHistory(data, use.feed) };
    case "ravens-feather":
      return { relic: use.relic, batch: peekBatch(data, use.batch) };
    case "hourglass":
      return {
        relic: use.relic,
        count: expectedRowCount(data, puzzle.goldTables, use.table, use.checkpointId),
      };
  }
}

/**
 * Uses a relic in the open hour: checks the run allows it (the reducer's rules, such as
 * holding the relic and no Darkness, raised as `RunEventError`), checks the target (raised as
 * {@link RelicError}), and returns the spent run, the event to store, and the reveal. Pure:
 * nothing is spent unless the caller stores the event.
 */
export function spendRelic(
  machine: RunMachine,
  state: RunState,
  intel: HourIntel,
  request: RelicRequest,
): RelicOutcome {
  if (state.hour && state.hour.puzzleId !== intel.puzzle.id) {
    throw new RelicError(
      "wrong-puzzle",
      `The open hour is ${state.hour.puzzleId}, not ${intel.puzzle.id}.`,
    );
  }
  const event: RelicOutcome["event"] = { kind: "relic_used", ...targetOf(state, intel, request) };
  const spent = machine.reduce(state, event);
  if (event.relic === "ravens-feather") {
    expectHidden(intel.data, event.batch, intel.visibleBatchCount, state.hour?.revealed ?? []);
  }
  return { state: spent, event, reveal: revealOf(event, intel) };
}
