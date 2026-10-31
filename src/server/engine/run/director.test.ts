import { describe, expect, it } from "vitest";
import { createPuzzleRegistry } from "../registry";
import { SLOTS, type Slot } from "../slots";
import { fakePuzzle } from "../testing/fake-puzzle";
import { machine, open, reach, settle, start } from "../testing/night-run";
import { CURSES, drawCurse } from "./curses";
import { createRunMachine } from "./reducer";
import { drawOffer, offerableRelics, RELICS } from "./relics";
import type { RunState } from "./types";

const seeds = Array.from({ length: 200 }, (_, i) => `seed-${String(i)}`);

const cleared = (state: RunState) =>
  machine.reduce(state, { kind: "hour_cleared", slot: state.slot });

describe("puzzle draws", () => {
  const variants = createRunMachine(
    createPuzzleRegistry([
      ...["a", "b", "c", "d"].map((id) => fakePuzzle({ id: `second-${id}`, slot: 2 })),
      fakePuzzle({ id: "first" }),
    ]),
  );
  const drawSecond = (seed: string) => {
    const state = variants.replay([
      { kind: "run_started", seed, character: "old_wren", unlockedActs: 1 },
      { kind: "hour_opened", slot: 1, puzzleId: "first", curse: null },
      { kind: "hour_cleared", slot: 1 },
    ]);
    const event = variants.next(state);
    return event?.kind === "hour_opened" ? event.puzzleId : null;
  };

  it("draws the same puzzle for the same seed and slot", () => {
    expect(drawSecond("raven-pumpkin-13")).toBe(drawSecond("raven-pumpkin-13"));
  });

  it("draws every variant across seeds", () => {
    expect(new Set(seeds.map(drawSecond))).toEqual(
      new Set(["second-a", "second-b", "second-c", "second-d"]),
    );
  });

  it("draws only puzzles whose prerequisites were played", () => {
    const state = reach(9);
    expect(machine.next(state)).toMatchObject({ kind: "hour_opened", puzzleId: "hour-9" });
  });

  it("is owed nothing while the run waits on the player or is over", () => {
    const inHour = open(start());
    expect(machine.next(inHour)).toBeNull();
    expect(machine.next(settle(cleared(inHour)))).toBeNull();
    expect(machine.next(machine.reduce(inHour, { kind: "run_abandoned" }))).toBeNull();
  });
});

describe("curses", () => {
  it("never curses the first hour", () => {
    expect(seeds.map((seed) => drawCurse(seed, 1))).toEqual(seeds.map(() => null));
  });

  it("curses about one hour in four, with every curse turning up", () => {
    const draws = seeds.flatMap((seed) =>
      SLOTS.filter((s) => s.slot > 1).map((s) => drawCurse(seed, s.slot)),
    );
    const cursed = draws.filter((curse) => curse !== null);
    expect(cursed.length / draws.length).toBeGreaterThan(0.2);
    expect(cursed.length / draws.length).toBeLessThan(0.3);
    expect(new Set(cursed)).toEqual(new Set(CURSES));
  });

  it("is fixed by seed and slot", () => {
    for (const seed of seeds.slice(0, 20)) {
      for (const { slot } of SLOTS) expect(drawCurse(seed, slot)).toBe(drawCurse(seed, slot));
    }
    const perSeed = seeds.map((seed) => SLOTS.map(({ slot }) => drawCurse(seed, slot)).join());
    expect(new Set(perSeed).size).toBeGreaterThan(50);
  });

  it("travels in the hour the game opens", () => {
    for (const seed of seeds.slice(0, 20)) {
      const event = machine.next(reach(4, { seed }));
      expect(event).toMatchObject({ kind: "hour_opened", curse: drawCurse(seed, 4) });
    }
  });
});

describe("relic offers", () => {
  const offerAfter = (seed: string, slot: Slot = 2) =>
    drawOffer(cleared(open(reach(slot, { seed }))));

  it("offers relics not in hand, sized for the character, accepted by the reducer", () => {
    for (const seed of seeds) {
      const state = cleared(open(reach(2, { seed })));
      const event = machine.next(state);
      expect(event).toEqual({ kind: "relic_offered", relics: drawOffer(state) });
      if (event) expect(machine.reduce(state, event).offer).toHaveLength(2);
      expect(drawOffer(state)).not.toContain("wrens-lantern");
    }
  });

  it("is fixed by seed and the cleared slot, whatever failed along the way", () => {
    const seed = "raven-pumpkin-13";
    const withFailure = cleared(
      machine.reduce(open(reach(2, { seed })), {
        kind: "attempt_failed",
        slot: 2,
        checkpointId: "late",
        revealedBatch: 2,
      }),
    );
    expect(drawOffer(withFailure)).toEqual(offerAfter(seed));
  });

  it("offers every relic in some run, Spare Candle included", () => {
    const offered = new Set(seeds.flatMap((seed) => offerAfter(seed, 5)));
    expect(offered).toEqual(new Set(offerableRelics(["wrens-lantern"])));
    expect(RELICS).toContain("spare-candle");
  });

  it("keeps offering Spare Candle, which is never held", () => {
    expect(offerableRelics(RELICS)).toEqual(["spare-candle"]);
  });

  it("never offers Old Wren a relic, all night", () => {
    let state = settle(start({ character: "old_wren" }));
    while (state.status === "playing") {
      state = settle(cleared(state));
      expect(state.offer).toBeNull();
      expect(state.relics).toEqual([]);
    }
    expect(state.status).toBe("victory");
  });
});
