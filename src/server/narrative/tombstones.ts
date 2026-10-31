import "server-only";
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
  readonly failedCheckpoint: Checkpoint;
  readonly daily: boolean;
  readonly progress: StoryProgress;
}

export interface Tombstone {
  readonly handle: string;
  readonly characterTitle: string;
  readonly epitaph: string;
  /** "went out at 7:15pm, Halloween 2026" */
  readonly wentOut: string;
  readonly seed: string;
  /** A faint green 1891 under the year, for Act III deaths once the Hollow has a name. */
  readonly hollowYear: boolean;
}

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
    wentOut: `went out at ${formatClock(death.failedCheckpoint.label)}, Halloween 2026`,
    seed: death.seed,
    hollowYear: death.act === 3 && death.progress.endingsSeen.includes("act-2"),
  };
}
