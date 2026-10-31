import { describe, expect, it } from "vitest";
import { generatePuzzle } from "../registry";
import { CURSES } from "../run/curses";
import { RunEventError } from "../run/errors";
import type { CurseId, RunState } from "../run/types";
import { fakePuzzle } from "../testing/fake-puzzle";
import { machine, open, reach, settle, start } from "../testing/night-run";
import { generateHour } from "./apply";
import { effectiveRetention, relicsUsable, SHORT_MEMORY_RETENTION } from "./limits";

const SEED = "raven-pumpkin-13";
const puzzle = fakePuzzle({
  retention: 3,
  possessable: [{ feed: "readings", column: "value", unit: "pts" }],
});

describe("an uncursed hour", () => {
  it("is the puzzle's own night, retention, and story", () => {
    expect(generateHour(puzzle, SEED, null)).toEqual({
      curse: null,
      data: generatePuzzle(puzzle, SEED),
      retention: 3,
      withheld: [],
      possession: null,
    });
  });
});

describe("the Curse of Short Memory", () => {
  it("drops bronze retention to one batch, and only under that curse", () => {
    expect(SHORT_MEMORY_RETENTION).toBe(1);
    expect(effectiveRetention(puzzle, "short-memory")).toBe(1);
    for (const curse of [null, "possession", "fog", "darkness"] as const) {
      expect(effectiveRetention(puzzle, curse)).toBe(3);
    }
  });

  it("leaves the night and its expected gold alone, since the answer never hangs on retention", () => {
    const hour = generateHour(puzzle, SEED, "short-memory");
    expect(hour.retention).toBe(1);
    expect(hour.data).toEqual(generatePuzzle(puzzle, SEED));
  });
});

/** Whether the reducer lets the player spend an Hourglass right now. */
function acceptsRelic(state: RunState): boolean {
  try {
    machine.reduce(state, { kind: "relic_used", relic: "hourglass" });
    return true;
  } catch (error) {
    if (error instanceof RunEventError) return false;
    throw error;
  }
}

describe("the Curse of Darkness", () => {
  const inHour = (curse: CurseId | null): RunState =>
    open({ ...reach(2), relics: ["hourglass"] }, curse);

  it("leaves the night itself untouched", () => {
    const hour = generateHour(puzzle, SEED, "darkness");
    expect(hour.data).toEqual(generatePuzzle(puzzle, SEED));
    expect(hour.retention).toBe(3);
  });

  it("puts relics out of reach for the hour, and only that curse does", () => {
    expect(relicsUsable(inHour("darkness"))).toBe(false);
    for (const curse of [null, ...CURSES.filter((c) => c !== "darkness")]) {
      expect(relicsUsable(inHour(curse))).toBe(true);
    }
  });

  it("agrees with the reducer in every hour", () => {
    for (const curse of [null, ...CURSES]) {
      const state = inHour(curse);
      expect(acceptsRelic(state)).toBe(relicsUsable(state));
    }
  });

  it("lifts when the dark hour closes", () => {
    const offered = settle(machine.reduce(inHour("darkness"), { kind: "hour_cleared", slot: 2 }));
    expect(relicsUsable(offered)).toBe(false);
    const next = open(machine.reduce(offered, { kind: "relic_declined" }));
    expect(next.slot).toBe(3);
    expect(next.relics).toContain("hourglass");
    expect(relicsUsable(next)).toBe(true);
    expect(acceptsRelic(next)).toBe(true);
  });

  it("is never in play between hours", () => {
    expect(relicsUsable({ ...start(), relics: ["hourglass"] })).toBe(false);
  });
});
