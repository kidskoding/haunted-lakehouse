import "server-only";
import type { TombstoneView } from "../../lib/run/tombstone";
import type { Checkpoint } from "../engine/puzzle";
import { rngFor } from "../engine/random";
import type { CharacterId } from "../engine/run/types";
import type { Act, Slot } from "../engine/slots";
import { PERSONAS } from "./bindings";
import { formatClock } from "./format";
import { narrativePack } from "./packs";
import type { StoryProgress } from "./progress";
import { NARRATIVE_STREAM } from "./reactions";

export const DAILY_EPITAPH = "Had one try. Used it.";
export const OLD_WREN_EPITAPH = "Kept it, this time.";
export const ANONYMOUS_HANDLE = "A New Hire";

export interface Death {
  readonly handle: string | null;
  readonly character: CharacterId;
  readonly seed: string;
  readonly slot: Slot;
  readonly act: Act;
  readonly puzzleId: string;
  /** Only its label is engraved, so a shared stone can carry just that. */
  readonly failedCheckpoint: Pick<Checkpoint, "label">;
  readonly daily: boolean;
  readonly progress: StoryProgress;
}

export type Tombstone = TombstoneView;

/**
 * The epitaph for a death: Old Wren's own, then the Daily Haunt's, then one of the hour's two,
 * picked by seed so a replayed seed shows the same stone.
 */
export function epitaph(death: Death): string {
  if (death.character === "old_wren") return OLD_WREN_EPITAPH;
  if (death.daily) return DAILY_EPITAPH;
  const { epitaphs } = narrativePack(death.puzzleId);
  return rngFor([NARRATIVE_STREAM, death.seed, death.slot, "epitaph", death.puzzleId]).pick(
    epitaphs,
  );
}

export function tombstone(death: Death): Tombstone {
  return {
    handle: death.handle ?? ANONYMOUS_HANDLE,
    characterTitle: PERSONAS[death.character].title,
    epitaph: epitaph(death),
    hour: narrativePack(death.puzzleId).title,
    wentOut: `went out at ${formatClock(death.failedCheckpoint.label)}, Halloween 2026`,
    seed: death.seed,
    hollowYear: death.act === 3 && death.progress.endingsSeen.includes("act-2"),
  };
}
