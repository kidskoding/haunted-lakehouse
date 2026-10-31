import "server-only";

import type { Speaker } from "../../lib/story/types";

export type { Speaker };

/** The cast members who can answer for an hour. */
export type HourOwner = "mayor" | "wren" | "marisol" | "thorne";

/** One line of story: a template, and the version the Curse of the Fog shows instead. */
export interface Line {
  readonly speaker: Speaker;
  readonly text: string;
  /** Required whenever `text` holds a symptom (`{*name}`); it must hold none itself. */
  readonly fog?: string;
}

export type Scene = readonly Line[];

/**
 * What a puzzle's narrative binding holds, so tests can check generated data against it and
 * build stand-in values for puzzles whose generators don't exist yet.
 */
export type BindingKind = "count" | "name" | "time";

/** The "What really happened" card: the only place technique names appear. */
export interface Autopsy {
  /** The concepts, plainly. */
  readonly title: string;
  /** What was really going on in the player's data, with their numbers. */
  readonly town: string;
  /** The trap, stated with respect, and the moment it breaks. */
  readonly tempting: string;
  /** The technique, named, with one precise definition. */
  readonly idea: string;
  /** Where real teams meet it, and how they prevent it. */
  readonly production: string;
  /** Terms to look up. Plain text. */
  readonly search: readonly string[];
}

/** What a tutorial callout points at, named by its job on the run screen, not by its markup. */
export type CalloutTarget =
  | "story"
  | "tables"
  | "editor"
  | "new-model"
  | "preview"
  | "run-the-night"
  | "candles"
  | "timeline";

/** A first-run tip. It teaches the game's controls, never the puzzle. */
export interface Callout {
  /** Stable, so the client can remember that a player dismissed it. */
  readonly id: string;
  readonly target: CalloutTarget;
  /** `tour` callouts show in order as the hour opens; `first-break` waits for a lost candle. */
  readonly when: "tour" | "first-break";
  /** A template, like a line's, holding no symptoms. */
  readonly text: string;
}

/** Everything the story says about one puzzle, keyed by the puzzle's id. */
export interface NarrativePack {
  readonly puzzleId: string;
  readonly title: string;
  /**
   * `launch` text is final; `draft` text follows the story bible until the puzzle's design
   * doc settles its clue.
   */
  readonly status: "launch" | "draft";
  /** Whoever answers for the hour when a candle goes out. */
  readonly owner: HourOwner;
  /** The keys this pack reads from the puzzle's `PuzzleData.narrative`, beyond the shared ones. */
  readonly bindings: Readonly<Record<string, BindingKind>>;
  readonly intro: Scene;
  /** Replaces the intro when the player is Old Wren. */
  readonly oldWrenIntro?: Scene;
  /** Empty only for an hour whose clear always plays an ending. */
  readonly cleared: Scene;
  /** Replaces the cleared beat when the binding is zero. */
  readonly clearedIfNone?: { readonly binding: string; readonly scene: Scene };
  /** Replaces the cleared beat once Wren has named the Hollow. */
  readonly clearedAfterHollow?: Scene;
  /** Leads into this hour from whichever hour came before; empty for the first hour. */
  readonly hook: Scene;
  /** The controls tour on a player's first run; only the hour that opens the night has one. */
  readonly tutorial?: readonly Callout[];
  readonly autopsy: Autopsy;
  readonly epitaphs: readonly [string, string];
}
