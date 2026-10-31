/*
 * The rendered story, as plain serializable data. The narrative engine is server-only; these
 * types are what it hands the client, so the story panel can import them without pulling the
 * engine (or its expected answers) into the browser.
 */

export type Speaker = "mayor" | "wren" | "marisol" | "thorne" | "moribund" | "narrator";

/** Inline emphasis from the template's `*em*`, `**strong**`, and `` `code` `` markers. */
export type Style = "plain" | "em" | "strong" | "code";

/**
 * Rendered story text: plain strings with a style, so the client can set numbers apart
 * without ever parsing markup or trusting HTML.
 */
export type Segment =
  | { readonly kind: "text"; readonly text: string; readonly style: Style }
  /** A value from the run. */
  | { readonly kind: "value"; readonly key: string; readonly text: string; readonly style: Style }
  /** A value the Curse of the Fog withheld. */
  | { readonly kind: "fog"; readonly key: string; readonly text: string; readonly style: Style };

export interface RenderedLine {
  readonly speaker: Speaker;
  /** Old Wren's own lines are thoughts, not speech. */
  readonly thought: boolean;
  readonly segments: readonly Segment[];
}

/** The "What really happened" card, with the run's numbers in it. */
export interface RenderedAutopsy {
  readonly title: readonly Segment[];
  readonly town: readonly Segment[];
  readonly tempting: readonly Segment[];
  readonly idea: readonly Segment[];
  readonly production: readonly Segment[];
  readonly search: readonly string[];
}

/** A ledger page as the player finds it: its fixed lore, rendered. */
export interface RenderedPage {
  readonly numeral: string;
  readonly year: number;
  readonly segments: readonly Segment[];
}
