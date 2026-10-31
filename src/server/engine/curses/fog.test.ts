import { describe, expect, it } from "vitest";
import type { Puzzle, PuzzleData } from "../puzzle";
import { generatePuzzle } from "../registry";
import { fakePuzzle } from "../testing/fake-puzzle";
import { generateHour } from "./apply";
import { fogNarrative } from "./fog";

/** A fake hour whose story binds two symptom numbers, a count it may show, and a name. */
function storied(symptoms?: readonly string[]): Puzzle {
  const base = fakePuzzle(symptoms === undefined ? {} : { symptoms });
  return {
    ...base,
    generate(context): PuzzleData {
      const data = base.generate(context);
      return {
        ...data,
        narrative: {
          mayorTotal: 412,
          dashboardTotal: 398,
          houses: 60,
          suspect: "the dentist",
        },
      };
    },
  };
}

const SEED = "raven-pumpkin-13";

describe("the Curse of the Fog", () => {
  it("withholds exactly the declared symptom keys", () => {
    const hour = generateHour(storied(["mayorTotal", "dashboardTotal"]), SEED, "fog");
    expect(hour.withheld).toEqual(["dashboardTotal", "mayorTotal"]);
    expect(hour.data.narrative).toEqual({ houses: 60, suspect: "the dentist" });
  });

  it("withholds every numeric binding when the puzzle declares no symptoms", () => {
    const hour = generateHour(storied(), SEED, "fog");
    expect(hour.withheld).toEqual(["dashboardTotal", "houses", "mayorTotal"]);
    expect(hour.data.narrative).toEqual({ suspect: "the dentist" });
  });

  it("withholds nothing when the puzzle declares no symptoms are worth hiding", () => {
    const hour = generateHour(storied([]), SEED, "fog");
    expect(hour.withheld).toEqual([]);
    expect(hour.data.narrative).toEqual(generatePuzzle(storied([]), SEED).narrative);
  });

  it("refuses a declared symptom the story never binds", () => {
    expect(() => fogNarrative(storied(["mayorTotl"]), { mayorTotal: 412 })).toThrow(/mayorTotl/);
  });

  it("leaves the night itself untouched", () => {
    const puzzle = storied(["mayorTotal"]);
    const clean = generatePuzzle(puzzle, SEED);
    const hour = generateHour(puzzle, SEED, "fog");
    expect(hour.data.batches).toEqual(clean.batches);
    expect(hour.data.checkpoints).toEqual(clean.checkpoints);
    expect(hour.data.expected).toEqual(clean.expected);
    expect(hour.retention).toBe(puzzle.retention);
    expect(hour.possession).toBeNull();
  });
});
