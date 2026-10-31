import { describe, expect, it } from "vitest";
import { createPuzzleRegistry } from "../registry";
import type { Slot } from "../slots";
import { fakePuzzle } from "../testing/fake-puzzle";
import { machine, open, reach, start, started, used } from "../testing/night-run";
import { RunEventError, type RunErrorCode } from "./errors";
import { createRunMachine } from "./reducer";
import type { CharacterId, CurseId, RunConfig, RunEvent, RunState } from "./types";

function rejects(state: RunState, event: RunEvent, code: RunErrorCode): void {
  const before = structuredClone(state);
  let caught: unknown;
  try {
    machine.reduce(state, event);
  } catch (error) {
    caught = error;
  }
  expect(caught).toBeInstanceOf(RunEventError);
  expect((caught as RunEventError).code).toBe(code);
  expect(state).toEqual(before);
}

const cleared = (state: RunState) =>
  machine.reduce(state, { kind: "hour_cleared", slot: state.slot });
const failed = (state: RunState, checkpointId = "early") =>
  machine.reduce(state, { kind: "attempt_failed", slot: state.slot, checkpointId });
const offered = (state: RunState, relics: RunState["relics"]) =>
  machine.reduce(state, { kind: "relic_offered", relics });

/** A run in the hour at `slot`, holding exactly the given relics. */
function inHour(slot: Slot, relics: RunState["relics"], curse: CurseId | null = null) {
  return open({ ...reach(slot), relics }, curse);
}

describe("startRun", () => {
  it.each<[CharacterId, number, RunState["relics"], boolean]>([
    ["intern", 4, ["wrens-lantern"], true],
    ["night_clerk", 3, [], true],
    ["purist", 3, [], false],
    ["old_wren", 1, [], true],
  ])("starts %s with %i candles", (character, candles, relics, table) => {
    const state = start({ character });
    expect(state).toMatchObject({
      character,
      candles,
      relics,
      tableMaterialization: table,
      status: "playing",
      phase: "opening",
      slot: 1,
      hour: null,
      history: [],
      offer: null,
      actReached: 1,
      lastEnding: null,
    });
  });

  it.each<[string, Partial<Record<keyof RunConfig, unknown>>]>([
    ["an empty seed", { seed: "" }],
    ["an unknown character", { character: "the-hollow" }],
    ["no unlocked acts", { unlockedActs: 0 }],
    ["a fourth act", { unlockedActs: 4 }],
  ])("rejects %s", (_, config) => {
    expect(() => start(config as Partial<RunConfig>)).toThrow(RunEventError);
  });
});

describe("replay", () => {
  it("needs a history that starts with run_started", () => {
    expect(() => machine.replay([])).toThrow(/begins with run_started/);
    expect(() => machine.replay([{ kind: "run_abandoned" }])).toThrow(RunEventError);
  });

  it("refuses a second run_started", () => {
    rejects(start(), started(), "already-started");
  });

  it("rebuilds the state the events produced live", () => {
    const events: RunEvent[] = [
      { kind: "hour_opened", slot: 1, puzzleId: "hour-1", curse: null },
      { kind: "attempt_failed", slot: 1, checkpointId: "late" },
      { kind: "hour_cleared", slot: 1 },
      { kind: "relic_offered", relics: ["black-cat", "spare-candle"] },
      { kind: "relic_chosen", relic: "black-cat" },
    ];
    const live = events.reduce(machine.reduce, start());
    expect(machine.replay([started(), ...events])).toEqual(live);
    expect(live).toMatchObject({ candles: 3, relics: ["wrens-lantern", "black-cat"], slot: 2 });
  });
});

describe("hour_opened", () => {
  it("opens the hour and tracks the furthest act", () => {
    const state = open(reach(4), "fog");
    expect(state.phase).toBe("in-hour");
    expect(state.hour).toEqual({ slot: 4, puzzleId: "hour-4", curse: "fog", failures: [] });
    expect(state.actReached).toBe(2);
  });

  it.each<[string, RunEvent, RunErrorCode]>([
    [
      "another slot",
      { kind: "hour_opened", slot: 2, puzzleId: "hour-2", curse: null },
      "wrong-slot",
    ],
    [
      "an unknown puzzle",
      { kind: "hour_opened", slot: 1, puzzleId: "ghost", curse: null },
      "unknown-puzzle",
    ],
    [
      "a puzzle from another slot",
      { kind: "hour_opened", slot: 1, puzzleId: "hour-2", curse: null },
      "puzzle-not-in-slot",
    ],
    [
      "a cursed first hour",
      { kind: "hour_opened", slot: 1, puzzleId: "hour-1", curse: "darkness" },
      "curse-on-first-hour",
    ],
  ])("rejects %s", (_, event, code) => {
    rejects(start(), event, code);
  });

  it("rejects opening while an hour is open", () => {
    rejects(
      open(start()),
      { kind: "hour_opened", slot: 1, puzzleId: "hour-1", curse: null },
      "wrong-phase",
    );
  });

  it("opens a puzzle only once its prerequisites were played this run", () => {
    const afterClear = reach(9);
    expect(open(afterClear).hour?.puzzleId).toBe("hour-9");

    const afterSkip = machine.reduce(inHour(8, ["black-cat"]), { kind: "hour_skipped", slot: 8 });
    rejects(
      afterSkip,
      { kind: "hour_opened", slot: 9, puzzleId: "hour-9", curse: null },
      "prerequisite-not-played",
    );
  });
});

describe("pool_exhausted", () => {
  it("strands the run when no puzzle in the pool is playable", () => {
    const afterSkip = machine.reduce(inHour(8, ["black-cat"]), { kind: "hour_skipped", slot: 8 });
    expect(machine.next(afterSkip)).toEqual({ kind: "pool_exhausted", slot: 9 });
    const stranded = machine.reduce(afterSkip, { kind: "pool_exhausted", slot: 9 });
    expect(stranded).toMatchObject({ status: "stranded", phase: "ended" });
  });

  it("strands the run at an empty pool", () => {
    const sparse = createRunMachine(createPuzzleRegistry([fakePuzzle({ id: "hour-1" })]));
    const state = sparse.replay([
      started(),
      { kind: "hour_opened", slot: 1, puzzleId: "hour-1", curse: null },
      { kind: "hour_cleared", slot: 1 },
      { kind: "relic_offered", relics: ["hourglass", "spare-candle"] },
      { kind: "relic_declined" },
    ]);
    expect(sparse.next(state)).toEqual({ kind: "pool_exhausted", slot: 2 });
  });

  it("is refused while a puzzle is playable, or for another slot", () => {
    rejects(start(), { kind: "pool_exhausted", slot: 1 }, "pool-not-exhausted");
    rejects(start(), { kind: "pool_exhausted", slot: 2 }, "wrong-slot");
    rejects(open(start()), { kind: "pool_exhausted", slot: 1 }, "wrong-phase");
  });
});

describe("attempt_failed", () => {
  it("costs one candle and records the checkpoint that broke", () => {
    const state = failed(failed(open(start()), "early"), "late");
    expect(state.candles).toBe(2);
    expect(state.hour?.failures).toEqual(["early", "late"]);
    expect(state.status).toBe("playing");
    expect(state.phase).toBe("in-hour");
  });

  it("costs two candles on a boss", () => {
    expect(failed(open(reach(3))).candles).toBe(2);
    expect(failed(open(reach(7))).candles).toBe(2);
    expect(failed(open(reach(10))).candles).toBe(2);
  });

  it("puts out the last candle and ends the run", () => {
    const dead = failed(open(start({ character: "old_wren" })));
    expect(dead).toMatchObject({ candles: 0, status: "dead", phase: "ended" });
    expect(dead.hour?.failures).toEqual(["early"]);
  });

  it("never goes below zero when a boss takes more than is left", () => {
    const state = open({ ...reach(3), candles: 1 });
    expect(failed(state)).toMatchObject({ candles: 0, status: "dead" });
  });

  it("is refused outside the open hour", () => {
    rejects(start(), { kind: "attempt_failed", slot: 1, checkpointId: "early" }, "wrong-phase");
    rejects(
      open(start()),
      { kind: "attempt_failed", slot: 2, checkpointId: "early" },
      "wrong-slot",
    );
  });
});

describe("hour_cleared", () => {
  it("closes the hour, moves to the next slot, and asks for an offer", () => {
    const state = cleared(failed(open(start())));
    expect(state).toMatchObject({ slot: 2, phase: "offering", hour: null, lastEnding: null });
    expect(state.history).toEqual([
      { slot: 1, puzzleId: "hour-1", curse: null, failures: ["early"], outcome: "cleared" },
    ]);
  });

  it("goes straight to the next hour for Old Wren, who is never offered relics", () => {
    const state = cleared(open(start({ character: "old_wren" })));
    expect(state.phase).toBe("opening");
    expect(machine.next(state)?.kind).toBe("hour_opened");
  });

  it("reveals each boss's ending and carries on while later acts are unlocked", () => {
    const afterAct1 = cleared(open(reach(3)));
    expect(afterAct1).toMatchObject({ status: "playing", slot: 4, lastEnding: "act-1" });
    const afterAct2 = cleared(open(reach(7)));
    expect(afterAct2).toMatchObject({ status: "playing", slot: 8, lastEnding: "act-2" });
  });

  it.each<[1 | 2, Slot]>([
    [1, 3],
    [2, 7],
  ])("ends a run with %i unlocked act(s) at the slot %i boss", (unlockedActs, slot) => {
    const state = cleared(open(reach(slot, { unlockedActs })));
    expect(state).toMatchObject({
      status: "won-act",
      phase: "ended",
      slot,
      lastEnding: `act-${String(unlockedActs)}`,
      offer: null,
    });
  });

  it("wins the night at the final boss", () => {
    const state = cleared(open(reach(10)));
    expect(state).toMatchObject({
      status: "victory",
      phase: "ended",
      slot: 10,
      lastEnding: "act-3",
    });
    expect(state.history.map((h) => h.slot)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(state.actReached).toBe(3);
  });

  it("is refused outside the open hour", () => {
    rejects(start(), { kind: "hour_cleared", slot: 1 }, "wrong-phase");
    rejects(open(start()), { kind: "hour_cleared", slot: 3 }, "wrong-slot");
  });
});

describe("hour_skipped", () => {
  it("spends the Black Cat to pass a non-boss hour, with no relic offer", () => {
    const state = machine.reduce(inHour(2, ["wrens-lantern", "black-cat"]), {
      kind: "hour_skipped",
      slot: 2,
    });
    expect(state).toMatchObject({
      slot: 3,
      phase: "opening",
      hour: null,
      relics: ["wrens-lantern"],
    });
    expect(state.history.at(-1)).toMatchObject({ slot: 2, outcome: "skipped" });
  });

  it("is refused on a boss, without the cat, in the dark, or outside the hour", () => {
    rejects(inHour(3, ["black-cat"]), { kind: "hour_skipped", slot: 3 }, "boss-cannot-be-skipped");
    rejects(inHour(2, ["hourglass"]), { kind: "hour_skipped", slot: 2 }, "relic-not-held");
    rejects(inHour(2, ["black-cat"], "darkness"), { kind: "hour_skipped", slot: 2 }, "darkness");
    rejects(inHour(2, ["black-cat"]), { kind: "hour_skipped", slot: 4 }, "wrong-slot");
    rejects(
      { ...reach(2), relics: ["black-cat"] },
      { kind: "hour_skipped", slot: 2 },
      "wrong-phase",
    );
  });
});

describe("relic offers", () => {
  const afterClear = (character: CharacterId, curse: CurseId | null = null) =>
    cleared(open(reach(2, { character }), curse));

  it("accepts an offer of two distinct relics not in hand", () => {
    const state = offered(afterClear("intern"), ["hourglass", "spare-candle"]);
    expect(state).toMatchObject({ phase: "choosing", offer: ["hourglass", "spare-candle"] });
  });

  it("offers the Night Clerk three", () => {
    const state = afterClear("night_clerk");
    expect(offered(state, ["hourglass", "black-cat", "wrens-lantern"]).offer).toHaveLength(3);
    rejects(state, { kind: "relic_offered", relics: ["hourglass", "black-cat"] }, "invalid-offer");
  });

  it("offers one more relic after a cursed hour", () => {
    const intern = afterClear("intern", "fog");
    expect(offered(intern, ["hourglass", "black-cat", "spare-candle"]).offer).toHaveLength(3);
    rejects(intern, { kind: "relic_offered", relics: ["hourglass", "black-cat"] }, "invalid-offer");
    const clerk = afterClear("night_clerk", "possession");
    expect(
      offered(clerk, ["hourglass", "black-cat", "spare-candle", "ravens-feather"]).offer,
    ).toHaveLength(4);
  });

  it("never offers more relics than could be offered", () => {
    const state = cleared(
      open(
        {
          ...reach(2, { character: "night_clerk" }),
          relics: ["wrens-lantern", "ravens-feather", "hourglass"],
        },
        "fog",
      ),
    );
    expect(offered(state, ["black-cat", "spare-candle"]).offer).toHaveLength(2);
  });

  it.each<[string, RunState["relics"]]>([
    ["too few", ["hourglass"]],
    ["too many", ["hourglass", "black-cat", "spare-candle"]],
    ["duplicates", ["spare-candle", "spare-candle"]],
    ["a relic in hand", ["wrens-lantern", "hourglass"]],
  ])("rejects an offer with %s", (_, relics) => {
    rejects(afterClear("intern"), { kind: "relic_offered", relics }, "invalid-offer");
  });

  it("is refused when no offer is due", () => {
    rejects(
      open(start()),
      { kind: "relic_offered", relics: ["hourglass", "black-cat"] },
      "wrong-phase",
    );
  });
});

describe("relic choices", () => {
  const choosing = (relics: RunState["relics"]) => offered(cleared(open(start())), relics);

  it("puts the chosen relic in hand", () => {
    const state = machine.reduce(choosing(["hourglass", "black-cat"]), {
      kind: "relic_chosen",
      relic: "black-cat",
    });
    expect(state).toMatchObject({
      phase: "opening",
      offer: null,
      relics: ["wrens-lantern", "black-cat"],
      candles: 4,
    });
  });

  it("burns a Spare Candle at once for one more candle", () => {
    const state = machine.reduce(choosing(["hourglass", "spare-candle"]), {
      kind: "relic_chosen",
      relic: "spare-candle",
    });
    expect(state).toMatchObject({ phase: "opening", candles: 5, relics: ["wrens-lantern"] });
  });

  it("lets the player decline", () => {
    const state = machine.reduce(choosing(["hourglass", "black-cat"]), { kind: "relic_declined" });
    expect(state).toMatchObject({ phase: "opening", offer: null, relics: ["wrens-lantern"] });
  });

  it("is refused for a relic not on offer, or with no offer open", () => {
    rejects(
      choosing(["hourglass", "black-cat"]),
      { kind: "relic_chosen", relic: "spare-candle" },
      "relic-not-offered",
    );
    rejects(open(start()), { kind: "relic_chosen", relic: "hourglass" }, "wrong-phase");
    rejects(open(start()), { kind: "relic_declined" }, "wrong-phase");
  });
});

describe("relic_used", () => {
  it("spends a relic in hand during the hour", () => {
    const state = machine.reduce(inHour(2, ["wrens-lantern", "hourglass"]), used("hourglass"));
    expect(state.relics).toEqual(["wrens-lantern"]);
    expect(state.phase).toBe("in-hour");
  });

  it("is refused for a relic not in hand, the Black Cat, a Spare Candle, in the dark, or between hours", () => {
    rejects(inHour(2, ["hourglass"]), used("ravens-feather"), "relic-not-held");
    rejects(inHour(2, ["black-cat"]), used("black-cat"), "relic-needs-skip");
    rejects(inHour(2, []), used("spare-candle"), "relic-not-held");
    rejects(inHour(2, ["hourglass"], "darkness"), used("hourglass"), "darkness");
    rejects(start(), used("wrens-lantern"), "wrong-phase");
  });

  it("works under every other curse", () => {
    for (const curse of ["possession", "fog", "short-memory"] as const) {
      expect(machine.reduce(inHour(2, ["hourglass"], curse), used("hourglass")).relics).toEqual([]);
    }
  });
});

describe("run_abandoned and terminal runs", () => {
  it("abandons from any phase of a playing run", () => {
    const phases = [
      start(),
      open(start()),
      cleared(open(start())),
      offered(cleared(open(start())), ["hourglass", "black-cat"]),
    ];
    expect(phases.map((s) => s.phase)).toEqual(["opening", "in-hour", "offering", "choosing"]);
    for (const state of phases) {
      expect(machine.reduce(state, { kind: "run_abandoned" })).toMatchObject({
        status: "abandoned",
        phase: "ended",
        offer: null,
      });
    }
  });

  it("accepts nothing once the run is over", () => {
    const over: RunState[] = [
      machine.reduce(start(), { kind: "run_abandoned" }),
      failed(open(start({ character: "old_wren" }))),
      cleared(open(reach(3, { unlockedActs: 1 }))),
      cleared(open(reach(10))),
    ];
    for (const state of over) {
      rejects(state, { kind: "run_abandoned" }, "run-over");
      rejects(state, { kind: "hour_cleared", slot: state.slot }, "run-over");
      expect(machine.next(state)).toBeNull();
    }
  });
});
