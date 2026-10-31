import "server-only";
import { relicsUsable } from "../curses/limits";
import type { PuzzleRegistry } from "../registry";
import { isSlot, slotDefinition, type Act, type Slot } from "../slots";
import { CHARACTERS, isCharacterId } from "./characters";
import { eligiblePuzzles, nextGameEvent, playedPuzzles } from "./director";
import { RunEventError } from "./errors";
import { offerableRelics, offerSize } from "./relics";
import type { EndingId, RelicId, RunConfig, RunEvent, RunPhase, RunState } from "./types";

const ENDINGS: Readonly<Record<Act, EndingId>> = { 1: "act-1", 2: "act-2", 3: "act-3" };

export interface RunMachine {
  /** The state of a run the moment it starts, before its first hour opens. */
  readonly start: (config: RunConfig) => RunState;
  /**
   * Applies one event, returning a new state and leaving the given one untouched. Throws a
   * {@link RunEventError} for an event the run can't accept, so no event ever leaves the run
   * in a state the rules forbid.
   */
  readonly reduce: (state: RunState, event: RunEvent) => RunState;
  /** Rebuilds a run from its stored events, which must begin with `run_started`. */
  readonly replay: (events: readonly RunEvent[]) => RunState;
  /** The draw or offer the game owes the run next, or null while it waits on the player. */
  readonly next: (state: RunState) => RunEvent | null;
}

/**
 * The run's rules as a pure reducer over its event log. Bound to a registry only to check
 * that an opened hour is one this run could have drawn; the draw itself is carried in the
 * event, so a stored run replays unchanged after new variants join a pool.
 */
export function createRunMachine(registry: PuzzleRegistry): RunMachine {
  const reduce = (state: RunState, event: RunEvent): RunState => applyEvent(registry, state, event);
  return {
    start: startRun,
    reduce,
    replay(events) {
      const [first, ...rest] = events;
      if (first?.kind !== "run_started") {
        throw new RunEventError("not-started", "A run's history begins with run_started.");
      }
      return rest.reduce(reduce, startRun(first));
    },
    next: (state) => nextGameEvent(registry, state),
  };
}

function startRun(config: RunConfig): RunState {
  const { seed, character, unlockedActs } = config;
  if (typeof seed !== "string" || seed.length === 0) {
    throw new RunEventError("invalid-config", "A run needs a seed.");
  }
  if (!isCharacterId(character)) {
    throw new RunEventError("invalid-config", `There is no character ${String(character)}.`);
  }
  if (!([1, 2, 3] as const).includes(unlockedActs)) {
    throw new RunEventError("invalid-config", "Unlocked acts must be 1, 2, or 3.");
  }
  const definition = CHARACTERS[character];
  return {
    seed,
    character,
    unlockedActs,
    status: "playing",
    phase: "opening",
    candles: definition.candles,
    tableMaterialization: definition.tableMaterialization,
    slot: 1,
    hour: null,
    history: [],
    relics: [...definition.startingRelics],
    offer: null,
    actReached: 1,
    lastEnding: null,
  };
}

function applyEvent(registry: PuzzleRegistry, state: RunState, event: RunEvent): RunState {
  if (event.kind === "run_started") {
    throw new RunEventError("already-started", "This run has already started.");
  }
  if (state.status !== "playing") {
    throw new RunEventError("run-over", `The run is over (${state.status}).`);
  }

  switch (event.kind) {
    case "hour_opened": {
      expectPhase(state, "opening", event.kind);
      expectSlot(state, event.slot);
      const puzzle = registry.get(event.puzzleId);
      if (!puzzle) {
        throw new RunEventError("unknown-puzzle", `There is no puzzle ${event.puzzleId}.`);
      }
      if (puzzle.slot !== event.slot) {
        throw new RunEventError(
          "puzzle-not-in-slot",
          `${puzzle.id} belongs to slot ${String(puzzle.slot)}.`,
        );
      }
      const played = playedPuzzles(state);
      const missing = puzzle.prerequisites.filter((id) => !played.has(id));
      if (missing.length > 0) {
        throw new RunEventError(
          "prerequisite-not-played",
          `${puzzle.id} needs ${missing.join(", ")} played earlier in the run.`,
        );
      }
      if (event.curse !== null && event.slot === 1) {
        throw new RunEventError("curse-on-first-hour", "The first hour is never cursed.");
      }
      const { act } = slotDefinition(event.slot);
      return {
        ...state,
        phase: "in-hour",
        hour: { slot: event.slot, puzzleId: puzzle.id, curse: event.curse, failures: [] },
        actReached: maxAct(state.actReached, act),
      };
    }

    case "pool_exhausted": {
      expectPhase(state, "opening", event.kind);
      expectSlot(state, event.slot);
      if (eligiblePuzzles(registry, state).length > 0) {
        throw new RunEventError(
          "pool-not-exhausted",
          `Slot ${String(event.slot)} still has a puzzle this run can play.`,
        );
      }
      return { ...state, status: "stranded", phase: "ended" };
    }

    case "attempt_failed": {
      const hour = expectHour(state, event.slot, event.kind);
      const cost = slotDefinition(hour.slot).boss ? 2 : 1;
      const candles = Math.max(0, state.candles - cost);
      const failed = {
        ...state,
        candles,
        hour: { ...hour, failures: [...hour.failures, event.checkpointId] },
      };
      return candles === 0 ? { ...failed, status: "dead", phase: "ended" } : failed;
    }

    case "hour_cleared": {
      const hour = expectHour(state, event.slot, event.kind);
      const { slot, act, boss } = slotDefinition(hour.slot);
      const closed: RunState = {
        ...state,
        hour: null,
        history: [...state.history, { ...hour, outcome: "cleared" }],
        lastEnding: boss ? ENDINGS[act] : state.lastEnding,
      };
      const following = slotAfter(slot);
      if (following === null) return { ...closed, status: "victory", phase: "ended" };
      if (boss && act >= state.unlockedActs) {
        return { ...closed, status: "won-act", phase: "ended" };
      }
      return {
        ...closed,
        slot: following,
        phase: offerSize(closed) > 0 ? "offering" : "opening",
      };
    }

    case "hour_skipped": {
      const hour = expectHour(state, event.slot, event.kind);
      if (slotDefinition(hour.slot).boss) {
        throw new RunEventError("boss-cannot-be-skipped", "The Black Cat won't cross a boss.");
      }
      expectUsable(state, "black-cat");
      const following = slotAfter(hour.slot);
      // Only the final hour has no successor, and it is a boss.
      if (following === null) throw new Error("A skippable hour always has a next hour.");
      return {
        ...state,
        slot: following,
        phase: "opening",
        hour: null,
        history: [...state.history, { ...hour, outcome: "skipped" }],
        relics: without(state.relics, "black-cat"),
      };
    }

    case "relic_offered": {
      expectPhase(state, "offering", event.kind);
      const offerable = offerableRelics(state.relics);
      const size = offerSize(state);
      const { relics } = event;
      if (
        relics.length !== size ||
        new Set(relics).size !== relics.length ||
        !relics.every((relic) => offerable.includes(relic))
      ) {
        throw new RunEventError(
          "invalid-offer",
          `An offer here holds ${String(size)} distinct relics not already in hand.`,
        );
      }
      return { ...state, phase: "choosing", offer: [...relics] };
    }

    case "relic_chosen": {
      expectPhase(state, "choosing", event.kind);
      if (!state.offer?.includes(event.relic)) {
        throw new RunEventError("relic-not-offered", `${event.relic} isn't on offer.`);
      }
      const chosen = { ...state, phase: "opening", offer: null } as const;
      return event.relic === "spare-candle"
        ? { ...chosen, candles: state.candles + 1 }
        : { ...chosen, relics: [...state.relics, event.relic] };
    }

    case "relic_declined":
      expectPhase(state, "choosing", event.kind);
      return { ...state, phase: "opening", offer: null };

    case "relic_used": {
      expectPhase(state, "in-hour", event.kind);
      if (event.relic === "black-cat") {
        throw new RunEventError("relic-needs-skip", "The Black Cat is used by skipping the hour.");
      }
      expectUsable(state, event.relic);
      return { ...state, relics: without(state.relics, event.relic) };
    }

    case "run_abandoned":
      // An offer left on the table dies with the run.
      return { ...state, status: "abandoned", phase: "ended", offer: null };
  }
}

function expectPhase(state: RunState, phase: RunPhase, kind: RunEvent["kind"]): void {
  if (state.phase !== phase) {
    throw new RunEventError("wrong-phase", `${kind} can't happen while the run is ${state.phase}.`);
  }
}

function expectSlot(state: RunState, slot: Slot): void {
  if (slot !== state.slot) {
    throw new RunEventError(
      "wrong-slot",
      `The event is for slot ${String(slot)}, but the run is at slot ${String(state.slot)}.`,
    );
  }
}

function expectHour(state: RunState, slot: Slot, kind: RunEvent["kind"]) {
  expectPhase(state, "in-hour", kind);
  expectSlot(state, slot);
  // The in-hour phase always has an open hour; the check narrows the type.
  if (!state.hour) throw new Error("An hour in play has no open hour.");
  return state.hour;
}

function expectUsable(state: RunState, relic: RelicId): void {
  if (!state.relics.includes(relic)) {
    throw new RunEventError("relic-not-held", `${relic} isn't in hand.`);
  }
  if (!relicsUsable(state)) {
    throw new RunEventError("darkness", "Relics can't be used in the dark.");
  }
}

function slotAfter(slot: Slot): Slot | null {
  const next = slot + 1;
  return isSlot(next) ? next : null;
}

function maxAct(a: Act, b: Act): Act {
  return a > b ? a : b;
}

function without(relics: readonly RelicId[], relic: RelicId): RelicId[] {
  return relics.filter((held) => held !== relic);
}
