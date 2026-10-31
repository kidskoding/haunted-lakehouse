"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState, type ReactNode, type RefObject } from "react";
import { StoryScene } from "@/components/run/story";
import { actName } from "@/components/run/top-bar/clock";
import { Button } from "@/components/ui/button";
import { buttonClassName } from "@/components/ui/button-styles";
import { CRYPT_HREF, type EndingRevealView, type RevealedCharacter } from "@/lib/run/ending";
import type { RenderedLine } from "@/lib/story/types";

export interface EndingScreenProps {
  /** The ending's title: "Dusk", "Night", "The Witching Hour", "Kept". */
  readonly title: string;
  /** The ending scene, already rendered by the narrative engine. */
  readonly lines: readonly RenderedLine[];
  /** What this ending unlocked for the first time, or null when it unlocked nothing new. */
  readonly reveal: EndingRevealView | null;
}

/** Where each act's runs used to stop: the boss before it, on the night's clock. */
const ACT_OPENS_AFTER: Readonly<Record<2 | 3, string>> = { 2: "7:30pm", 3: "10:30pm" };

function candleCount(candles: number): string {
  return `${String(candles)} ${candles === 1 ? "candle" : "candles"}`;
}

function listOf(names: readonly string[]): string {
  if (names.length <= 1) return names.join("");
  return `${names.slice(0, -1).join(", ")} and ${names.at(-1) ?? ""}`;
}

/** The reveal's headline: the act it opened, or else the characters it unlocked. */
export function revealHeading(reveal: EndingRevealView): string {
  if (reveal.act !== null) {
    const { numeral, name } = actName(reveal.act);
    return `Act ${numeral}: ${name} is open.`;
  }
  const names = reveal.characters.map((character) => character.name);
  return `${listOf(names)} ${names.length === 1 ? "is" : "are"} unlocked.`;
}

/**
 * The moment after a boss is cleared: the ending scene, then, only when this clear unlocked
 * something new, the reveal of what it opened. Continue goes to the Crypt. Focus moves to each
 * step's heading as it arrives, so a keyboard or screen reader player starts at the top.
 */
export function EndingScreen({ title, lines, reveal }: EndingScreenProps) {
  const [revealing, setRevealing] = useState(false);
  const titleId = useId();
  const titleRef = useRef<HTMLHeadingElement>(null);
  const revealRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    (revealing ? revealRef : titleRef).current?.focus();
  }, [revealing]);

  const toCrypt = (
    <Link href={CRYPT_HREF} className={buttonClassName("primary", "lg")}>
      Continue to the Crypt
    </Link>
  );

  return (
    <section
      aria-labelledby={titleId}
      className="mx-auto flex w-full max-w-reading flex-col gap-10 px-4 py-16 death-fade sm:px-0"
    >
      <h2
        id={titleId}
        ref={titleRef}
        tabIndex={-1}
        className="text-balance text-parchment outline-none type-display-xl"
      >
        {title}
      </h2>

      {revealing && reveal ? (
        <Reveal reveal={reveal} headingRef={revealRef} action={toCrypt} />
      ) : (
        <div className="flex flex-col gap-10">
          <StoryScene lines={lines} />
          <div>
            {reveal ? (
              <Button
                variant="primary"
                size="lg"
                onClick={() => {
                  setRevealing(true);
                }}
              >
                Continue
              </Button>
            ) : (
              toCrypt
            )}
          </div>
        </div>
      )}
    </section>
  );
}

function Reveal({
  reveal,
  headingRef,
  action,
}: {
  readonly reveal: EndingRevealView;
  readonly headingRef: RefObject<HTMLHeadingElement | null>;
  readonly action: ReactNode;
}) {
  // With no act to announce, the characters are the headline, so their rows drop the name.
  const named = reveal.act !== null;
  return (
    <div className="flex flex-col gap-8 story-reveal">
      <div className="flex flex-col gap-3">
        <h3
          ref={headingRef}
          tabIndex={-1}
          className="text-balance text-flame outline-none type-display-l"
        >
          {revealHeading(reveal)}
        </h3>
        {reveal.act !== null ? (
          <p className="text-pretty text-parchment type-prose">
            Your next run goes on past {ACT_OPENS_AFTER[reveal.act]}.
          </p>
        ) : null}
      </div>
      {reveal.characters.length > 0 ? (
        <ul aria-label="Characters unlocked" className="flex flex-col gap-3">
          {reveal.characters.map((character) => (
            <CharacterRow key={character.name} character={character} named={named} />
          ))}
        </ul>
      ) : null}
      <div>{action}</div>
    </div>
  );
}

function CharacterRow({
  character,
  named,
}: {
  readonly character: RevealedCharacter;
  readonly named: boolean;
}) {
  return (
    <li className="flex flex-col gap-1 rounded-m bg-panel px-6 py-5">
      {named ? <p className="text-parchment type-heading">{character.name} is unlocked.</p> : null}
      <p className="text-pretty text-ash type-ui-l">
        {candleCount(character.candles)}. {character.rules.join(" ")}
      </p>
    </li>
  );
}
