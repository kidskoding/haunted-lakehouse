import { Fragment, type ReactNode } from "react";
import type { Segment, Style } from "@/lib/story/types";

/**
 * Wraps text in its template style. Emphasis flips the slant of whatever surrounds it, as in
 * print: a voiced (italic) line sets its `*em*` upright.
 */
function styled(style: Style, voiced: boolean, children: ReactNode): ReactNode {
  switch (style) {
    case "plain":
      return children;
    case "em":
      return <em className={voiced ? "not-italic" : "italic"}>{children}</em>;
    case "strong":
      return <strong className="font-semibold">{children}</strong>;
    case "code":
      return (
        <code className="rounded-xs bg-inset px-1 text-parchment not-italic type-code leading-none box-decoration-clone">
          {children}
        </code>
      );
  }
}

/**
 * Bindings that are how the cast addresses the player ("new hire", "the Night Clerk"), not
 * data from the run. They read as ordinary words: lighting them would mistake a name for a
 * number the player produced.
 */
const ADDRESS_KEYS: ReadonlySet<string> = new Set(["you", "keeper_name", "character_title"]);

function inner(segment: Segment): ReactNode {
  switch (segment.kind) {
    case "text":
      return segment.text;
    case "value":
      if (ADDRESS_KEYS.has(segment.key)) return segment.text;
      // The player's own numbers, in the flame's light, with figures that hold their width.
      return (
        <span data-segment="value" className="font-semibold text-glow tabular-nums lining-nums">
          {segment.text}
        </span>
      );
    case "fog":
      // The words already say what is missing ("a number lost in the fog"), so they read
      // aloud as they are; the wash is for sighted players.
      return (
        <span data-segment="fog" className="rounded-xs bg-fog px-1 text-ash box-decoration-clone">
          {segment.text}
        </span>
      );
  }
}

export interface StoryTextProps {
  readonly segments: readonly Segment[];
  /** Whether the surrounding text is a voice (italic), so emphasis can flip against it. */
  readonly voiced: boolean;
}

/** One line's rendered segments, as inline text. Never parses markup: every string is text. */
export function StoryText({ segments, voiced }: StoryTextProps) {
  return segments.map((segment, index) => (
    // Segments are a fixed rendering of one line and never reorder.
    <Fragment key={index}>{styled(segment.style, voiced, inner(segment))}</Fragment>
  ));
}
