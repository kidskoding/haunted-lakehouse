import "server-only";
import type { NarrativePack } from "../types";
import { candyCoOp } from "./candy-co-op";
import { changeling } from "./changeling";
import { graveyardShift } from "./graveyard-shift";
import { hallOfMirrors } from "./hall-of-mirrors";
import { porchLights } from "./porch-lights";
import { possessedFeed } from "./possessed-feed";
import { seance } from "./seance";
import { thirteenthDoor } from "./thirteenth-door";
import { wanderingGhost } from "./wandering-ghost";
import { witchingHour } from "./witching-hour";

/** Every hour's story, in the order of the night. A pool variant adds its own pack here. */
export const NARRATIVE_PACKS: readonly NarrativePack[] = [
  porchLights,
  thirteenthDoor,
  possessedFeed,
  hallOfMirrors,
  wanderingGhost,
  changeling,
  graveyardShift,
  candyCoOp,
  witchingHour,
  seance,
];

const BY_ID = new Map(NARRATIVE_PACKS.map((pack) => [pack.puzzleId, pack]));

/** The story for a puzzle. Every playable puzzle has one, so a missing pack is a bug. */
export function narrativePack(puzzleId: string): NarrativePack {
  const pack = BY_ID.get(puzzleId);
  if (!pack) throw new Error(`Puzzle ${puzzleId} has no story.`);
  return pack;
}
