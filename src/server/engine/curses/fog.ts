import "server-only";
import type { Puzzle, PuzzleData } from "../puzzle";

export interface FoggedNarrative {
  /** The bindings left to render. Withheld values are removed, so they never reach the client. */
  readonly narrative: PuzzleData["narrative"];
  /** The keys the story shows as fog instead of a number, sorted. */
  readonly withheld: readonly string[];
}

/**
 * The keys the fog takes: the puzzle's declared symptoms, or every numeric binding when it
 * declares none, so an undeclared puzzle errs toward hiding too much rather than too little.
 */
export function symptomKeys(puzzle: Puzzle, narrative: PuzzleData["narrative"]): string[] {
  if (puzzle.symptoms === undefined) {
    return Object.keys(narrative)
      .filter((key) => typeof narrative[key] === "number")
      .sort();
  }
  for (const key of puzzle.symptoms) {
    // A misspelt symptom would leave its number in plain sight.
    if (!(key in narrative)) {
      throw new Error(`Puzzle ${puzzle.id} declares a symptom ${key} its story never binds.`);
    }
  }
  return [...new Set(puzzle.symptoms)].sort();
}

/** Withholds the symptom numbers from the story's bindings. */
export function fogNarrative(puzzle: Puzzle, narrative: PuzzleData["narrative"]): FoggedNarrative {
  const withheld = symptomKeys(puzzle, narrative);
  const hidden = new Set(withheld);
  return {
    narrative: Object.fromEntries(Object.entries(narrative).filter(([key]) => !hidden.has(key))),
    withheld,
  };
}
