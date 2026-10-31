"use client";

import { useEffect, useEffectEvent, useId, useRef } from "react";
import { actName, clockLabel, type ActNumber } from "@/components/run/top-bar";
import { Button } from "@/components/ui/button";
import { cx } from "@/components/ui/cx";
import { Shortcut } from "@/components/ui/kbd";
import { CurseFog } from "./curse-fog";

/** The curse an hour opens under, in the town's words, from the engine's flavor table. */
export interface CurseIntroView {
  /** "Curse of the Fog". */
  readonly name: string;
  /** The town's line about it. */
  readonly flavor: string;
  /** What it changes, plainly. */
  readonly effect: string;
  /** The engine's word that clearing this hour puts one more relic on the table. */
  readonly bonusRelic: boolean;
}

/** A boss hour, from the slot table and the hour's story. */
export interface BossIntroView {
  /** "The Possessed Feed". */
  readonly title: string;
  /** The hour's opening time, `HH:MM` on a 24-hour clock, as in the slot table. */
  readonly time: string;
  /** Difficulty, 1 to 5. */
  readonly tier: number;
  readonly act: ActNumber;
  /** Candles a failed "Run the night" costs here, from the engine. */
  readonly candleCost: number;
}

export interface HourIntroProps {
  readonly boss: BossIntroView | null;
  readonly curse: CurseIntroView | null;
  /** The player is ready. The run screen then removes the intro and moves focus to the story. */
  readonly onBegin: () => void;
}

const MAX_TIER = 5;
const COUNT_WORDS = ["no", "one", "two", "three", "four"];

/** Enter begins the hour from anywhere but a control, which answers Enter on its own. */
function isControl(target: EventTarget | null): boolean {
  return (
    target instanceof Element &&
    target.closest("button, a[href], input, select, textarea, [contenteditable]") !== null
  );
}

/**
 * The moment an hour opens on a curse, a boss, or both. A curse brings fog in from the frame's
 * edges and names what it changes; a boss dims the frame and its title rises out of the dark,
 * with what a failure costs. It fills its nearest positioned ancestor, which the run screen
 * makes inert behind it. Focus starts on the one button, so Enter begins the hour; Enter also
 * works from anywhere else on the page while the intro is up.
 */
export function HourIntro({ boss, curse, onBegin }: HourIntroProps) {
  const titleId = useId();
  const bodyId = useId();
  const button = useRef<HTMLButtonElement>(null);
  const begun = useRef(false);

  const begin = () => {
    if (begun.current) return;
    begun.current = true;
    onBegin();
  };

  const onKey = useEffectEvent((event: KeyboardEvent) => {
    if (event.key !== "Enter" || event.repeat || event.defaultPrevented) return;
    if (isControl(event.target)) return;
    event.preventDefault();
    begin();
  });

  useEffect(() => {
    button.current?.focus();
    const listener = (event: KeyboardEvent) => {
      onKey(event);
    };
    window.addEventListener("keydown", listener);
    return () => {
      window.removeEventListener("keydown", listener);
    };
  }, []);

  if (!boss && !curse) return null;

  return (
    <section
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={bodyId}
      data-intro={boss ? "boss" : "curse"}
      className="absolute inset-0 overflow-y-auto"
    >
      {/* The boss dims the frame further; a curse alone leaves the run screen in sight. */}
      <div
        aria-hidden="true"
        className={cx("absolute inset-0 death-fade", boss ? "bg-void/85" : "bg-void/55")}
      />
      {curse ? <CurseFog /> : null}
      <div className="relative flex min-h-full flex-col items-center justify-center gap-8 px-4 py-12">
        {boss ? <BossTitle boss={boss} titleId={titleId} bodyId={bodyId} /> : null}
        {curse ? (
          <CurseCard curse={curse} titleId={boss ? null : titleId} bodyId={boss ? null : bodyId} />
        ) : null}
        <Button
          ref={button}
          variant="primary"
          size="lg"
          aria-keyshortcuts="Enter"
          className={boss ? "title-rise" : undefined}
          onClick={() => {
            begin();
          }}
        >
          {boss ? "Face the hour" : "Begin the hour"}
          <Shortcut keys={["Enter"]} aria-hidden />
        </Button>
      </div>
    </section>
  );
}

function BossTitle({
  boss,
  titleId,
  bodyId,
}: {
  readonly boss: BossIntroView;
  readonly titleId: string;
  readonly bodyId: string;
}) {
  const { numeral, name } = actName(boss.act);
  const tier = Math.min(Math.max(Math.round(boss.tier), 1), MAX_TIER);
  const cost = COUNT_WORDS[boss.candleCost] ?? String(boss.candleCost);
  return (
    <div className="flex flex-col items-center gap-5 text-center title-rise">
      <h2 id={titleId} className="text-balance text-parchment type-display-xl">
        {boss.title}
      </h2>
      <p className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-ash type-ui-l">
        <span>{clockLabel(boss.time)}</span>
        <span>
          Act {numeral}, {name}
        </span>
        {/* Filled and hollow stars differ in shape, so the tier never rests on colour alone. */}
        <span
          role="img"
          aria-label={`Difficulty ${String(tier)} of ${String(MAX_TIER)}`}
          className="text-flame"
        >
          {"★".repeat(tier)}
          {"☆".repeat(MAX_TIER - tier)}
        </span>
      </p>
      <p id={bodyId} className="max-w-copy text-pretty text-parchment type-prose">
        This hour closes the act. If the night breaks here, it takes {cost} candles, not one.
      </p>
    </div>
  );
}

function CurseCard({
  curse,
  titleId,
  bodyId,
}: {
  readonly curse: CurseIntroView;
  /** Null when a boss title already names the moment, so the curse takes a lower heading. */
  readonly titleId: string | null;
  readonly bodyId: string | null;
}) {
  const Heading = titleId ? "h2" : "h3";
  return (
    <div
      className={cx(
        "relative flex w-full max-w-reading flex-col gap-4 rounded-m bg-panel px-8 py-8 shadow-dialog",
        titleId ? "story-reveal" : "title-rise",
      )}
    >
      <Heading
        id={titleId ?? undefined}
        className={cx("text-balance text-hollow", titleId ? "type-display-l" : "type-display-m")}
      >
        {curse.name}
      </Heading>
      <div id={bodyId ?? undefined} className="flex flex-col gap-4">
        <p className="text-pretty text-parchment italic type-prose">{curse.flavor}</p>
        <p className="text-pretty text-parchment type-ui-l">{curse.effect}</p>
        {curse.bonusRelic ? (
          <p className="text-pretty text-ash type-prose-s">
            Clear it anyway and one more relic waits on the table after.
          </p>
        ) : null}
      </div>
    </div>
  );
}
