import { createPuzzleRegistry } from "../registry";
import { createRunMachine } from "../run/reducer";
import type { CurseId, RunConfig, RunEvent, RunState } from "../run/types";
import { SLOTS, type Slot } from "../slots";
import { fakePuzzle } from "./fake-puzzle";

/** One fake puzzle per slot, shaped like the launch night: the 1am hour builds on 11:15pm's. */
export const nightRegistry = createPuzzleRegistry(
  SLOTS.map(({ slot }) =>
    fakePuzzle({ id: `hour-${String(slot)}`, slot, prerequisites: slot === 9 ? ["hour-8"] : [] }),
  ),
);

export const machine = createRunMachine(nightRegistry);

export const INTERN: RunConfig = {
  seed: "raven-pumpkin-13",
  character: "intern",
  unlockedActs: 3,
};

export function started(config: Partial<RunConfig> = {}): RunEvent {
  return { kind: "run_started", ...INTERN, ...config };
}

export function start(config: Partial<RunConfig> = {}): RunState {
  return machine.start({ ...INTERN, ...config });
}

/** Applies the game's own draws and offers until the run waits on the player. */
export function settle(state: RunState): RunState {
  let current = state;
  for (let event = machine.next(current); event; event = machine.next(current)) {
    current = machine.reduce(current, event);
  }
  return current;
}

/** Opens the current slot's fake puzzle by hand, with the given curse. */
export function open(state: RunState, curse: CurseId | null = null): RunState {
  return machine.reduce(state, {
    kind: "hour_opened",
    slot: state.slot,
    puzzleId: `hour-${String(state.slot)}`,
    curse,
  });
}

/**
 * A run waiting to open `slot`, reached by opening each earlier hour uncursed, clearing it,
 * and declining every relic.
 */
export function reach(slot: Slot, config: Partial<RunConfig> = {}): RunState {
  let state = start(config);
  while (state.slot < slot) {
    state = machine.reduce(open(state), { kind: "hour_cleared", slot: state.slot });
    if (state.phase === "offering") state = settle(state);
    if (state.phase === "choosing") state = machine.reduce(state, { kind: "relic_declined" });
  }
  return state;
}
