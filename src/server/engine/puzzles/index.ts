import "server-only";
import type { Puzzle } from "../puzzle";

/**
 * Every puzzle the game can draw. Each puzzle adds itself here when its generator lands, and
 * tests that range over all puzzles (the narrative check among them) pick it up unchanged.
 */
export const ALL_PUZZLES: readonly Puzzle[] = [];
