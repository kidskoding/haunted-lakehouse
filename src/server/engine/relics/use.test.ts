import { describe, expect, it } from "vitest";
import { generatePuzzle } from "../registry";
import { RunEventError, type RunErrorCode } from "../run/errors";
import type { CurseId, RunState } from "../run/types";
import type { Slot } from "../slots";
import { machine, nightRegistry, open, reach } from "../testing/night-run";
import { RelicError, type RelicErrorCode } from "./errors";
import { revealOf, spendRelic, type HourIntel, type RelicRequest } from "./use";

/** A run in the hour at `slot`, holding exactly the given relics. */
function inHour(slot: Slot, relics: RunState["relics"], curse: CurseId | null = null) {
  return open({ ...reach(slot), relics }, curse);
}

function intelFor(state: RunState, visibleBatchCount = 1): HourIntel {
  const puzzle = nightRegistry.get(state.hour?.puzzleId ?? "hour-1");
  if (!puzzle) throw new Error("The night registry lost a puzzle.");
  return { puzzle, data: generatePuzzle(puzzle, state.seed), visibleBatchCount };
}

function refusal(state: RunState, request: RelicRequest, intel = intelFor(state)): unknown {
  try {
    spendRelic(machine, state, intel, request);
  } catch (error) {
    return error;
  }
  throw new Error(`${request.relic} was not refused.`);
}

function refusedByRun(state: RunState, request: RelicRequest, code: RunErrorCode): void {
  const error = refusal(state, request);
  expect(error).toBeInstanceOf(RunEventError);
  expect((error as RunEventError).code).toBe(code);
}

function refusedByRelic(
  state: RunState,
  request: RelicRequest,
  code: RelicErrorCode,
  intel?: HourIntel,
): void {
  const error = refusal(state, request, intel);
  expect(error).toBeInstanceOf(RelicError);
  expect((error as RelicError).code).toBe(code);
}

const ALL: RunState["relics"] = ["wrens-lantern", "ravens-feather", "hourglass"];

describe("spendRelic", () => {
  it("lights Wren's Lantern on a feed and spends it", () => {
    const state = inHour(2, ALL);
    const outcome = spendRelic(machine, state, intelFor(state), {
      relic: "wrens-lantern",
      feed: "readings",
    });
    expect(outcome.event).toEqual({ kind: "relic_used", relic: "wrens-lantern", feed: "readings" });
    expect(outcome.state.relics).toEqual(["ravens-feather", "hourglass"]);
    expect(outcome.reveal).toEqual({
      relic: "wrens-lantern",
      history: {
        feed: "readings",
        versions: [
          {
            fromBatch: 0,
            arrivesAt: "18:00",
            columns: [{ name: "value", type: "number" }],
            changes: [],
          },
        ],
      },
    });
  });

  it("shows one hidden batch with The Raven's Feather", () => {
    const state = inHour(2, ALL);
    const intel = intelFor(state);
    const outcome = spendRelic(machine, state, intel, { relic: "ravens-feather", batch: 2 });
    expect(outcome.event).toEqual({ kind: "relic_used", relic: "ravens-feather", batch: 2 });
    expect(outcome.reveal).toEqual({ relic: "ravens-feather", batch: intel.data.batches[2] });
    expect(outcome.state.relics).toEqual(["wrens-lantern", "hourglass"]);
  });

  it("turns The Hourglass on the next checkpoint, and gives only a count", () => {
    const fresh = inHour(2, ALL);
    const before = spendRelic(machine, fresh, intelFor(fresh), {
      relic: "hourglass",
      table: "gold.totals",
    });
    expect(before.event).toEqual({
      kind: "relic_used",
      relic: "hourglass",
      table: "gold.totals",
      checkpointId: "early",
    });
    expect(before.reveal).toEqual({
      relic: "hourglass",
      count: { table: "gold.totals", checkpointId: "early", label: "18:05", rowCount: 1 },
    });

    const broke = machine.reduce(fresh, { kind: "attempt_failed", slot: 2, checkpointId: "late" });
    const after = spendRelic(machine, broke, intelFor(broke), {
      relic: "hourglass",
      table: "gold.totals",
    });
    expect(after.event).toMatchObject({ checkpointId: "late" });
    // The expected total is a number in the fake puzzle's rows: it must not reach the player.
    const expected = intelFor(broke).data.expected.late?.["gold.totals"];
    expect(JSON.stringify(after)).not.toContain(JSON.stringify(expected));
    expect(Object.keys(after.reveal)).toEqual(["relic", "count"]);
  });

  it("leaves the given state untouched, and gives the same reveal for the same seed", () => {
    const state = inHour(2, ALL);
    const snapshot = structuredClone(state);
    const request = { relic: "wrens-lantern", feed: "readings" } as const;
    const first = spendRelic(machine, state, intelFor(state), request);
    expect(state).toEqual(snapshot);
    expect(spendRelic(machine, state, intelFor(state), request)).toEqual(first);
  });

  it("refuses the Black Cat and Spare Candle, which reveal nothing", () => {
    const state = inHour(2, ["black-cat", ...ALL]);
    refusedByRelic(state, { relic: "black-cat" }, "not-targeted");
    refusedByRelic(state, { relic: "spare-candle" }, "not-targeted");
  });

  it("refuses every relic in the dark, before looking at the target", () => {
    const dark = inHour(2, ALL, "darkness");
    refusedByRun(dark, { relic: "wrens-lantern", feed: "readings" }, "darkness");
    refusedByRun(dark, { relic: "wrens-lantern", feed: "nowhere" }, "darkness");
    refusedByRun(dark, { relic: "ravens-feather", batch: 2 }, "darkness");
    refusedByRun(dark, { relic: "hourglass", table: "gold.totals" }, "darkness");
  });

  it("refuses a relic not in hand, or outside an hour", () => {
    refusedByRun(inHour(2, ["hourglass"]), { relic: "ravens-feather", batch: 2 }, "relic-not-held");
    refusedByRun(reach(2), { relic: "hourglass", table: "gold.totals" }, "wrong-phase");
  });

  it("refuses a target the hour doesn't have", () => {
    const state = inHour(2, ALL);
    refusedByRelic(state, { relic: "wrens-lantern", feed: "porch_lights" }, "unknown-feed");
    refusedByRelic(state, { relic: "hourglass", table: "gold.cursed_houses" }, "unknown-table");
    refusedByRelic(state, { relic: "ravens-feather", batch: 7 }, "unknown-batch");
  });

  it("refuses a peek at a batch already in bronze", () => {
    const state = inHour(2, ALL);
    refusedByRelic(state, { relic: "ravens-feather", batch: 0 }, "batch-not-hidden");
    refusedByRelic(
      state,
      { relic: "ravens-feather", batch: 2 },
      "batch-not-hidden",
      intelFor(state, 3),
    );
  });

  it("refuses intel for a different puzzle than the open hour", () => {
    const state = inHour(2, ALL);
    refusedByRelic(
      state,
      { relic: "wrens-lantern", feed: "readings" },
      "wrong-puzzle",
      intelFor(inHour(3, ALL)),
    );
  });
});

describe("revealOf", () => {
  it("rebuilds each reveal from its stored event, even after the hour moved on", () => {
    const state = inHour(2, ALL);
    const intel = intelFor(state);
    const requests: RelicRequest[] = [
      { relic: "wrens-lantern", feed: "readings" },
      { relic: "ravens-feather", batch: 1 },
      { relic: "hourglass", table: "gold.totals" },
    ];
    for (const request of requests) {
      const { event, reveal } = spendRelic(machine, state, intel, request);
      const stored: unknown = JSON.parse(JSON.stringify(event));
      expect(revealOf(stored as typeof event, intel)).toEqual(reveal);
    }
  });
});

describe("relics the reducer applies directly", () => {
  it("lets the Black Cat skip a non-boss hour, spending it with no clear to reward", () => {
    const state = inHour(2, ["black-cat", "hourglass"]);
    const skipped = machine.reduce(state, { kind: "hour_skipped", slot: 2 });
    expect(skipped.relics).toEqual(["hourglass"]);
    expect(skipped.history.at(-1)).toMatchObject({ slot: 2, outcome: "skipped" });
    expect(skipped).toMatchObject({ slot: 3, phase: "opening", offer: null });
    expect(machine.next(skipped)).toMatchObject({ kind: "hour_opened", slot: 3 });
  });

  it("won't let the Black Cat cross a boss or the dark", () => {
    expect(() =>
      machine.reduce(inHour(3, ["black-cat"]), { kind: "hour_skipped", slot: 3 }),
    ).toThrow(RunEventError);
    expect(() =>
      machine.reduce(inHour(2, ["black-cat"], "darkness"), { kind: "hour_skipped", slot: 2 }),
    ).toThrow(RunEventError);
  });

  it("burns a Spare Candle the moment it's chosen, for one more candle", () => {
    let state = reach(1);
    for (const slot of [1, 2] as const) {
      const cleared = machine.reduce(open(state), { kind: "hour_cleared", slot });
      const offered = machine.reduce(cleared, {
        kind: "relic_offered",
        relics: ["spare-candle", "hourglass"],
      });
      state = machine.reduce(offered, { kind: "relic_chosen", relic: "spare-candle" });
      expect(state.candles).toBe(cleared.candles + 1);
      expect(state.relics).toEqual(["wrens-lantern"]);
    }
    expect(state.candles).toBe(reach(1).candles + 2);
    refusedByRun(open(state), { relic: "hourglass", table: "gold.totals" }, "relic-not-held");
  });
});
