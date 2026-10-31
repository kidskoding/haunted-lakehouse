import "server-only";
import type { Puzzle } from "../puzzle";
import { porchLights } from "./porch-lights";
import { possessedFeed } from "./possessed-feed/puzzle";

/**
 * Every puzzle the game can draw. Each puzzle adds itself here when its generator lands, and
 * tests that range over all puzzles (the narrative check among them) pick it up unchanged.
 */
export const ALL_PUZZLES: readonly Puzzle[] = [porchLights, possessedFeed];
