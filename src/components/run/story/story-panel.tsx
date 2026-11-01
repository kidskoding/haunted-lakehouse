import type { CSSProperties } from "react";
import { MoonIcon } from "@/components/ui/icons";
import { Panel, PanelBody, PanelEmpty, PanelHeader, PanelTitle } from "@/components/ui/panel";
import { cx } from "@/components/ui/cx";
import type { RenderedLine, Segment } from "@/lib/story/types";
import { SPEAKERS, turnName, turnsOf, type Turn } from "./speakers";
import { StoryText } from "./story-text";

/** A first-run tip beside the story. A rendered tutorial callout fits as it is. */
export interface StoryAside {
  readonly id: string;
  readonly segments: readonly Segment[];
}

export interface StoryPanelProps {
  /** The panel's name: the hour's title, or "Story" before one opens. */
  readonly title: string;
  /** The scene, already rendered by the narrative engine. Empty shows the quiet state. */
  readonly lines: readonly RenderedLine[];
  readonly asides?: readonly StoryAside[];
  readonly className?: string;
}

// Turns arrive one after another, but a long scene must not keep the player waiting.
const STAGGER_MS = 90;
const STAGGER_CAP = 6;

function revealDelay(index: number): CSSProperties {
  return { animationDelay: `${String(Math.min(index, STAGGER_CAP) * STAGGER_MS)}ms` };
}

function Monogram({ speaker }: { readonly speaker: Turn["speaker"] }) {
  const { mark, markClass } = SPEAKERS[speaker];
  return (
    <span
      aria-hidden="true"
      className={cx(
        "flex size-9 items-center justify-center rounded-xs bg-raised text-parchment @xs:row-span-2",
        markClass,
      )}
    >
      {mark}
    </span>
  );
}

function TurnLines({ turn }: { readonly turn: Turn }) {
  // Characters speak in the voice preset; the narrator's stage directions stand upright.
  const voiced = turn.speaker !== "narrator";
  return (
    <div className="flex flex-col gap-3">
      {turn.lines.map((line, lineIndex) => (
        <p
          // A turn's lines are a fixed rendering of the scene and never reorder.
          key={lineIndex}
          className={cx(
            "max-w-story text-pretty type-prose",
            voiced && "italic",
            // A thought is quieter than speech; everything else reads in the full ink.
            turn.thought ? "text-ash" : "text-parchment",
          )}
        >
          <StoryText segments={line.segments} voiced={voiced} />
        </p>
      ))}
    </div>
  );
}

function StoryTurn({ turn, index }: { readonly turn: Turn; readonly index: number }) {
  const name = turnName(turn);
  // Stage directions have no face: they run the full width, like a script's action lines,
  // so they never read as the last speaker going on.
  if (SPEAKERS[turn.speaker].mark === null) {
    return (
      <li className="story-reveal" style={revealDelay(index)}>
        <p className="sr-only">{name}</p>
        <TurnLines turn={turn} />
      </li>
    );
  }
  return (
    <li
      className="grid grid-cols-[2.25rem_minmax(0,1fr)] gap-x-4 gap-y-2 story-reveal @xs:gap-y-1"
      style={revealDelay(index)}
    >
      <Monogram speaker={turn.speaker} />
      <p className="self-center font-semibold text-ash type-ui @xs:self-auto @xs:pt-2">{name}</p>
      {/* Under 20rem, the lines take the monogram's width back and the name sits beside it. */}
      <div className="col-span-2 @xs:col-span-1 @xs:col-start-2">
        <TurnLines turn={turn} />
      </div>
    </li>
  );
}

/** A rendered scene's turns, each under its speaker's monogram, arriving one after another. */
export function StoryScene({ lines }: { readonly lines: readonly RenderedLine[] }) {
  return (
    <ol className="flex flex-col gap-6 @container">
      {turnsOf(lines).map((turn, index) => (
        <StoryTurn
          // Turns are a fixed rendering of the scene and never reorder.
          key={index}
          turn={turn}
          index={index}
        />
      ))}
    </ol>
  );
}

/**
 * The hour's story: each character's lines under their monogram, the run's numbers set in
 * candlelight, and anything the Curse of the Fog took left in the fog. It renders segments the
 * server already made, so it never sees the engine or a template.
 */
export function StoryPanel({ title, lines, asides = [], className }: StoryPanelProps) {
  const turns = turnsOf(lines);
  return (
    <Panel className={cx("h-full", className)}>
      <PanelHeader>
        <PanelTitle>{title}</PanelTitle>
      </PanelHeader>
      {/* Focusable so the keyboard can scroll a long scene. */}
      <PanelBody tabIndex={0} className="px-6 py-6">
        {turns.length === 0 ? (
          <PanelEmpty>
            Nobody in Hollow Creek has asked for anything yet. When someone does, you&rsquo;ll read
            it here.
          </PanelEmpty>
        ) : (
          <div className="flex flex-col gap-8">
            <StoryScene lines={lines} />
            {asides.length > 0 ? (
              <aside
                aria-label="First-night tips"
                className="story-reveal"
                style={revealDelay(turns.length)}
              >
                <div className="flex max-w-story gap-3 rounded-xs bg-tint-moon px-4 py-4 text-parchment type-ui">
                  <MoonIcon className="mt-0.5 size-4 shrink-0 text-moon" />
                  {/* The tour's order is the order the controls are met in. */}
                  <ol className="flex flex-col gap-3">
                    {asides.map((aside) => (
                      <li key={aside.id} className="text-pretty">
                        <StoryText segments={aside.segments} voiced={false} />
                      </li>
                    ))}
                  </ol>
                </div>
              </aside>
            ) : null}
          </div>
        )}
      </PanelBody>
    </Panel>
  );
}
