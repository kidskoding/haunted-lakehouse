import { describe, expect, it } from "vitest";
import { rngFor, type Rng } from "../random";
import { SLOTS, slotDefinition } from "../slots";
import { machine, started } from "../testing/night-run";
import { CHARACTERS } from "./characters";
import { CURSES } from "./curses";
import { RunEventError } from "./errors";
import { RELICS } from "./relics";
import type { CharacterId, RunConfig, RunEvent, RunState } from "./types";

const CHARACTER_IDS = Object.keys(CHARACTERS) as CharacterId[];
const PUZZLE_IDS = [...SLOTS.map(({ slot }) => `hour-${String(slot)}`), "ghost"];

function deepFreeze<T>(value: T): T {
  if (typeof value === "object" && value !== null) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

/** Any event at all, legal or not, to probe the reducer's guards. */
function arbitraryEvent(rng: Rng): RunEvent {
  const slot = rng.pick(SLOTS).slot;
  const relic = rng.pick(RELICS);
  const options: RunEvent[] = [
    started(),
    {
      kind: "hour_opened",
      slot,
      puzzleId: rng.pick(PUZZLE_IDS),
      curse: rng.pick([null, ...CURSES]),
    },
    { kind: "pool_exhausted", slot },
    { kind: "attempt_failed", slot, checkpointId: "early" },
    { kind: "hour_cleared", slot },
    { kind: "hour_skipped", slot },
    { kind: "relic_offered", relics: RELICS.filter(() => rng.float() < 0.5) },
    { kind: "relic_chosen", relic },
    { kind: "relic_declined" },
    { kind: "relic_used", relic },
  ];
  return rng.pick(options);
}

/** A move the player could make, or the game's own draw when one is owed. */
function legalMove(state: RunState, rng: Rng): RunEvent {
  const owed = machine.next(state);
  if (owed) return owed;
  if (rng.float() < 0.01) return { kind: "run_abandoned" };
  if (state.phase === "choosing") {
    const offer = state.offer ?? [];
    return rng.float() < 0.2 || offer.length === 0
      ? { kind: "relic_declined" }
      : { kind: "relic_chosen", relic: rng.pick(offer) };
  }
  const usable = state.hour?.curse === "darkness" ? [] : state.relics;
  const roll = rng.float();
  if (roll < 0.25) return { kind: "attempt_failed", slot: state.slot, checkpointId: "late" };
  if (roll < 0.35 && usable.includes("black-cat") && !slotDefinition(state.slot).boss) {
    return { kind: "hour_skipped", slot: state.slot };
  }
  const spendable = usable.filter((relic) => relic !== "black-cat");
  if (roll < 0.45 && spendable.length > 0) {
    return { kind: "relic_used", relic: rng.pick(spendable) };
  }
  return { kind: "hour_cleared", slot: state.slot };
}

function checkInvariants(state: RunState, previous: RunState): void {
  const playing = state.status === "playing";
  expect(playing).toBe(state.phase !== "ended");
  expect(state.candles).toBeGreaterThanOrEqual(0);
  expect(state.status === "dead").toBe(state.candles === 0);
  expect(state.slot).toBeGreaterThanOrEqual(previous.slot);
  expect(state.actReached).toBeGreaterThanOrEqual(previous.actReached);
  expect(state.history.length).toBeGreaterThanOrEqual(previous.history.length);

  const slots = state.history.map((h) => h.slot);
  slots.forEach((slot, i) => {
    expect(slot).toBe(i + 1);
  });
  expect(state.history.every((h) => h.outcome !== "skipped" || !slotDefinition(h.slot).boss)).toBe(
    true,
  );

  if (state.phase === "in-hour") expect(state.hour?.slot).toBe(state.slot);
  if (playing && state.phase !== "in-hour") {
    expect(state.hour).toBeNull();
    expect(slots.length).toBe(state.slot - 1);
  }
  expect(state.offer !== null).toBe(state.phase === "choosing");

  expect(new Set(state.relics).size).toBe(state.relics.length);
  expect(state.relics).not.toContain("spare-candle");
  if (state.character === "old_wren") {
    expect(state.relics).toEqual([]);
    expect(["offering", "choosing"]).not.toContain(state.phase);
  }
  expect(state.tableMaterialization).toBe(state.character !== "purist");

  if (state.status === "victory") expect(state.lastEnding).toBe("act-3");
  if (state.status === "won-act") {
    expect(state.lastEnding).toBe(`act-${String(state.unlockedActs)}`);
  }
}

function playRandomRun(seed: string, rng: Rng): { state: RunState; log: RunEvent[] } {
  const config: RunConfig = {
    seed,
    character: rng.pick(CHARACTER_IDS),
    unlockedActs: rng.pick([1, 2, 3] as const),
  };
  const log: RunEvent[] = [{ kind: "run_started", ...config }];
  let state = deepFreeze(machine.start(config));

  for (let step = 0; step < 500 && state.status === "playing"; step++) {
    const probe = rng.float() < 0.3;
    const event = probe ? arbitraryEvent(rng) : legalMove(state, rng);
    let next: RunState;
    try {
      next = deepFreeze(machine.reduce(state, event));
    } catch (error) {
      // Only probes may be refused, and only with the run's own error type.
      expect(probe).toBe(true);
      expect(error).toBeInstanceOf(RunEventError);
      continue;
    }
    checkInvariants(next, state);
    log.push(event);
    state = next;
  }

  expect(state.status).not.toBe("playing");
  for (let i = 0; i < 20; i++) {
    expect(() => machine.reduce(state, arbitraryEvent(rng))).toThrow(RunEventError);
  }
  return { state, log };
}

describe("random runs", () => {
  const runs = Array.from({ length: 300 }, (_, i) => {
    const seed = `property-${String(i)}`;
    return { seed, ...playRandomRun(seed, rngFor(["@test", seed, 0])) };
  });

  it("hold every invariant and replay to the same state from their logs", () => {
    for (const { state, log } of runs) {
      expect(machine.replay(log)).toEqual(state);
      expect(JSON.parse(JSON.stringify(log))).toEqual(log);
    }
  });

  it("reach every way a run can end", () => {
    const endings = new Set(runs.map(({ state }) => state.status));
    expect(endings).toEqual(new Set(["won-act", "victory", "dead", "abandoned", "stranded"]));
  });

  it("are the same run for the same seed", () => {
    for (const { seed, log } of runs.slice(0, 20)) {
      expect(playRandomRun(seed, rngFor(["@test", seed, 0])).log).toEqual(log);
    }
  });
});
