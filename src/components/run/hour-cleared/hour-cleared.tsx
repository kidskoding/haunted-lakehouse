"use client";

import { useEffect, useId, useRef, useState, type ReactNode, type RefObject } from "react";
import { RadioForm } from "@/components/character-select/radio-form";
import { RelicGlyph } from "@/components/run/bottom-bar/relic-glyph";
import { StoryScene } from "@/components/run/story";
import { StoryText } from "@/components/run/story/story-text";
import { Button } from "@/components/ui/button";
import { cx } from "@/components/ui/cx";
import type { RelicKind, RelicView } from "@/lib/run/bottom-bar";
import { useSound } from "@/lib/sound/react";
import type { RenderedAutopsy, RenderedLine, RenderedPage, Segment } from "@/lib/story/types";

export interface HourClearedProps {
  /** The hour's title: "Porch Lights". */
  readonly title: string;
  /** The cleared beat, already rendered by the narrative engine. */
  readonly beat: readonly RenderedLine[];
  /** A ledger page this hour's data gave up, if it held one. */
  readonly page?: RenderedPage | null;
  readonly autopsy: RenderedAutopsy;
  /** The relics on offer; empty when the character is never offered any. */
  readonly offer: readonly RelicView[];
  /** The curse the hour was cleared under, when it added a relic to the offer. */
  readonly bonusCurse?: string | null;
  /** The relic taken, or `null` when the player took none or none was offered. */
  readonly onFinish: (relic: RelicKind | null) => void;
}

export type ClearedStep = "beat" | "autopsy" | "relics";

const STEP_NAMES: Readonly<Record<ClearedStep, string>> = {
  beat: "The town",
  autopsy: "What really happened",
  relics: "A relic",
};

/** The steps this clear walks through: a beat only if there is one, relics only if offered. */
export function clearedSteps(
  props: Pick<HourClearedProps, "beat" | "page" | "offer">,
): ClearedStep[] {
  const steps: ClearedStep[] = [];
  if (props.beat.length > 0 || props.page) steps.push("beat");
  steps.push("autopsy");
  if (props.offer.length > 0) steps.push("relics");
  return steps;
}

const COUNT_WORDS = ["none", "one", "two", "three", "four", "five"];

/**
 * The moment after an hour is cleared: the town's beat, then the "What really happened"
 * autopsy, the only place technique names appear, then the relic offer. Each step advances
 * with one primary button and takes the focus, so a keyboard or screen reader player lands on
 * what just arrived. The hour-cleared sting plays once, as the moment opens.
 */
export function HourCleared(props: HourClearedProps) {
  const { title, onFinish } = props;
  const steps = clearedSteps(props);
  const [index, setIndex] = useState(0);
  const step = steps[Math.min(index, steps.length - 1)] ?? "autopsy";
  const last = index >= steps.length - 1;
  const headingRef = useRef<HTMLHeadingElement>(null);
  const titleId = useId();

  const { play } = useSound();
  const played = useRef(false);
  useEffect(() => {
    if (played.current) return;
    played.current = true;
    play("hour-cleared");
  }, [play]);

  useEffect(() => {
    headingRef.current?.focus();
  }, [step]);

  const advance = () => {
    if (last) onFinish(null);
    else setIndex(index + 1);
  };
  const advanceLabel = last
    ? "Into the next hour"
    : steps[index + 1] === "autopsy"
      ? "What really happened"
      : "Choose a relic";

  return (
    <section
      aria-labelledby={titleId}
      className="mx-auto flex w-full max-w-reading flex-col gap-10 px-4 py-12 sm:px-0"
    >
      <header className="flex flex-col gap-6">
        <h2 id={titleId} className="text-balance text-parchment type-display-l">
          {title}, cleared
        </h2>
        {steps.length > 1 ? (
          <ol aria-label="This clear" className="flex flex-wrap gap-x-6 gap-y-2 type-ui">
            {steps.map((candidate, position) => (
              <li
                key={candidate}
                aria-current={candidate === step ? "step" : undefined}
                className={cx(
                  "border-b-2 pb-1",
                  candidate === step
                    ? "border-flame font-semibold text-parchment"
                    : position < index
                      ? "border-transparent text-ash"
                      : "border-transparent text-smoke",
                )}
              >
                {STEP_NAMES[candidate]}
              </li>
            ))}
          </ol>
        ) : null}
      </header>

      {/* Keyed by step so each one arrives as the last leaves. */}
      <div key={step} className="flex flex-col gap-8 story-reveal">
        {step === "beat" ? (
          <BeatStep {...props} headingRef={headingRef} />
        ) : step === "autopsy" ? (
          <AutopsyStep autopsy={props.autopsy} headingRef={headingRef} />
        ) : (
          <RelicStep
            offer={props.offer}
            bonusCurse={props.bonusCurse ?? null}
            headingRef={headingRef}
            onFinish={onFinish}
          />
        )}
        {step === "relics" ? null : (
          <div>
            <Button variant="primary" size="lg" onClick={advance}>
              {advanceLabel}
            </Button>
          </div>
        )}
      </div>
    </section>
  );
}

type HeadingRef = RefObject<HTMLHeadingElement | null>;

/** A step's heading, which takes the focus when the step arrives; it is not a control. */
function StepHeading({
  headingRef,
  className,
  children,
}: {
  readonly headingRef: HeadingRef;
  readonly className: string;
  readonly children: ReactNode;
}) {
  return (
    <h3 ref={headingRef} tabIndex={-1} className={cx("text-balance outline-none", className)}>
      {children}
    </h3>
  );
}

function BeatStep({
  beat,
  page,
  headingRef,
}: Pick<HourClearedProps, "beat" | "page"> & { readonly headingRef: HeadingRef }) {
  return (
    <>
      {/* The step list already names it on screen; the heading is for the focus to land on. */}
      <StepHeading headingRef={headingRef} className="sr-only">
        {STEP_NAMES.beat}
      </StepHeading>
      {beat.length > 0 ? (
        <div className="rounded-m bg-panel px-6 py-6">
          <StoryScene lines={beat} />
        </div>
      ) : null}
      {page ? (
        <aside
          aria-label={`Ledger page ${page.numeral}`}
          className="flex flex-col gap-3 rounded-m bg-tint-hollow px-6 py-6 text-hollow"
        >
          <p className="type-heading">
            A torn page in tonight&rsquo;s data: page {page.numeral}, {page.year}
          </p>
          <p className="max-w-reading text-pretty type-prose-s">
            <StoryText segments={page.segments} voiced={false} />
          </p>
          <p className="type-ui">It goes in your ledger, and stays there after this run.</p>
        </aside>
      ) : null}
    </>
  );
}

function AutopsySection({
  heading,
  segments,
}: {
  readonly heading: string;
  readonly segments: readonly Segment[];
}) {
  return (
    <div className="flex flex-col gap-2">
      <h4 className="text-parchment type-ui-l">{heading}</h4>
      <p className="text-pretty text-parchment type-prose-s">
        <StoryText segments={segments} voiced={false} />
      </p>
    </div>
  );
}

function AutopsyStep({
  autopsy,
  headingRef,
}: {
  readonly autopsy: RenderedAutopsy;
  readonly headingRef: HeadingRef;
}) {
  return (
    <article className="flex flex-col gap-7 rounded-m bg-panel px-6 py-8 sm:px-8">
      <StepHeading headingRef={headingRef} className="text-parchment type-display-m">
        <StoryText segments={autopsy.title} voiced={false} />
      </StepHeading>
      <AutopsySection heading="In your data" segments={autopsy.town} />
      <AutopsySection heading="Why the easy answer was tempting" segments={autopsy.tempting} />
      <AutopsySection heading="The idea" segments={autopsy.idea} />
      <AutopsySection heading="In production" segments={autopsy.production} />
      {autopsy.search.length > 0 ? (
        <div className="flex flex-col gap-2">
          <h4 className="text-parchment type-ui-l">To look up</h4>
          <ul className="flex flex-wrap gap-2">
            {autopsy.search.map((term) => (
              <li key={term} className="rounded-xs bg-inset px-2 py-1 text-ash type-ui">
                {term}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </article>
  );
}

function RelicStep({
  offer,
  bonusCurse,
  headingRef,
  onFinish,
}: {
  readonly offer: readonly RelicView[];
  readonly bonusCurse: string | null;
  readonly headingRef: HeadingRef;
  readonly onFinish: HourClearedProps["onFinish"];
}) {
  const headingId = useId();
  const noteId = useId();
  const [chosen, setChosen] = useState<RelicKind | undefined>(offer[0]?.kind);
  const relic = offer.find((candidate) => candidate.kind === chosen) ?? offer[0];
  const count = COUNT_WORDS[offer.length] ?? String(offer.length);

  return (
    <RadioForm
      className="flex flex-col gap-6"
      onSubmit={(event) => {
        event.preventDefault();
        if (relic) onFinish(relic.kind);
      }}
    >
      <div className="flex flex-col gap-2">
        <StepHeading headingRef={headingRef} className="text-parchment type-heading">
          <span id={headingId}>Take one of {count}</span>
        </StepHeading>
        <p id={noteId} className="text-pretty text-ash type-prose-s">
          {bonusCurse
            ? `You cleared it under the ${bonusCurse}, so one more relic is on the table.`
            : "Each relic is good for one use, in any hour that isn't dark."}
        </p>
      </div>

      <fieldset
        role="radiogroup"
        aria-labelledby={headingId}
        aria-describedby={noteId}
        className="flex flex-col gap-3"
      >
        {offer.map((candidate) => (
          <RelicOption
            key={candidate.kind}
            relic={candidate}
            checked={candidate.kind === relic?.kind}
            name={headingId}
            onCheck={() => {
              setChosen(candidate.kind);
            }}
          />
        ))}
      </fieldset>

      <div className="flex flex-wrap gap-3">
        <Button type="submit" variant="primary" size="lg">
          Take {relic?.name ?? "it"}
        </Button>
        <Button
          variant="ghost"
          size="lg"
          onClick={() => {
            onFinish(null);
          }}
        >
          Take nothing
        </Button>
      </div>
    </RadioForm>
  );
}

function RelicOption({
  relic,
  checked,
  name,
  onCheck,
}: {
  readonly relic: RelicView;
  readonly checked: boolean;
  readonly name: string;
  readonly onCheck: () => void;
}) {
  const detailsId = useId();
  return (
    <label
      className={cx(
        "relative flex cursor-pointer gap-4 rounded-m bg-panel py-5 ps-5 pe-14",
        "transition-colors duration-fast ease-out ui-hover:bg-raised",
        "has-checked:bg-tint-flame ui-hover:has-checked:bg-tint-flame",
        "has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-glow",
      )}
    >
      <input
        type="radio"
        name={name}
        value={relic.kind}
        checked={checked}
        onChange={onCheck}
        aria-describedby={detailsId}
        className="peer sr-only"
      />
      <RelicGlyph kind={relic.kind} className="mt-1 size-6 text-glow" />
      <span className="flex flex-col gap-1">
        <span className="text-parchment type-heading">{relic.name}</span>
        <span id={detailsId} className="flex flex-col gap-1">
          <span className="text-pretty text-parchment type-ui-l">{relic.effect}</span>
          <span className="text-pretty text-ash italic type-prose-s">{relic.flavor}</span>
        </span>
      </span>
      {/* A plain radio dot, so the choice never rests on colour alone. */}
      <span
        aria-hidden="true"
        className={cx(
          "absolute top-6 right-5 grid size-5 place-items-center rounded-full",
          "border-2 border-line-control bg-inset peer-checked:border-flame",
          "peer-checked:[&>span]:scale-100",
        )}
      >
        <span className="size-2.5 scale-0 rounded-full bg-flame transition-transform duration-fast ease-out" />
      </span>
    </label>
  );
}
