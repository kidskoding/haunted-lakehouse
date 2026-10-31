import type { RenderedLine, Speaker } from "@/lib/story/types";

export interface SpeakerStyle {
  /** How the panel names them, aloud and on screen. */
  readonly name: string;
  /** The monogram's letters; the narrator has none, since stage directions have no face. */
  readonly mark: string | null;
  /**
   * The monogram's letterform. Each cast member is told apart by the drawing of their letter,
   * not by colour: palette inks carry state here, and the cast is not a state.
   */
  readonly markClass: string;
}

export const SPEAKERS: Readonly<Record<Speaker, SpeakerStyle>> = {
  // Pompous: the heaviest, wonkiest drawing of the title face.
  mayor: {
    name: "The Mayor",
    mark: "M",
    markClass:
      "text-heading font-display font-bold [font-variation-settings:var(--fraunces-title)]",
  },
  // Dry and sidelong: the italic.
  wren: {
    name: "Wren",
    mark: "W",
    markClass:
      "text-heading font-display italic font-normal [font-variation-settings:var(--fraunces-heading)]",
  },
  // Meticulous: the plain reading cut, light and upright.
  marisol: {
    name: "Marisol",
    mark: "Ma",
    markClass:
      "text-heading font-display font-light [font-variation-settings:var(--fraunces-prose)]",
  },
  // Stern about rules: sharp and upright.
  thorne: {
    name: "Thorne",
    mark: "T",
    markClass:
      "text-heading font-display font-semibold [font-variation-settings:var(--fraunces-prose)]",
  },
  // A support inbox, not a person: set in the interface face, like a letterhead.
  moribund: {
    name: "Moribund Party Supply",
    mark: "MPS",
    markClass: "font-sans font-bold text-ui-s tracking-normal",
  },
  narrator: { name: "Narrator", mark: null, markClass: "" },
};

/** One speaker's consecutive lines, shown under a single monogram. */
export interface Turn {
  readonly speaker: Speaker;
  readonly thought: boolean;
  readonly lines: readonly RenderedLine[];
}

/**
 * Groups a scene into turns: a speaker who says two things in a row is introduced once. A
 * thought and speech from the same speaker stay apart, since they read differently.
 */
export function turnsOf(lines: readonly RenderedLine[]): Turn[] {
  const turns: Turn[] = [];
  for (const line of lines) {
    const last = turns.at(-1);
    if (last && last.speaker === line.speaker && last.thought === line.thought) {
      turns[turns.length - 1] = { ...last, lines: [...last.lines, line] };
    } else {
      turns.push({ speaker: line.speaker, thought: line.thought, lines: [line] });
    }
  }
  return turns;
}

/** The name a turn is announced by: Old Wren's own lines are her thinking, not speech. */
export function turnName(turn: Pick<Turn, "speaker" | "thought">): string {
  const { name } = SPEAKERS[turn.speaker];
  return turn.thought ? `${name}, to herself` : name;
}
