import type { RenderedAutopsy } from "../story/types";

/** One hour's place in the Codex: its name and when it falls in the night. */
interface CodexHour {
  readonly puzzleId: string;
  /** The hour's title: "Porch Lights". */
  readonly title: string;
  /** When the hour opens, as the clock shows it: "6:00pm". */
  readonly time: string;
}

/** An autopsy the player earned, rendered with the numbers of the night they last cleared it. */
export interface WrittenEntry extends CodexHour {
  readonly kind: "written";
  /** The run whose numbers the autopsy carries. */
  readonly seed: string;
  readonly autopsy: RenderedAutopsy;
}

/** An hour not yet cleared. It carries nothing beyond its name and time, so it spoils nothing. */
export interface LockedEntry extends CodexHour {
  readonly kind: "locked";
}

export type CodexEntry = WrittenEntry | LockedEntry;
