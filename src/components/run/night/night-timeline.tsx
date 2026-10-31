"use client";

import type { Application } from "pixi.js";
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { Scene } from "@/components/scene/scene";
import type { SceneLoader } from "@/components/scene/types";
import { START_HOUR, type CandleClockProps } from "@/components/scene/scenes/candle-clock-art";
import { CandleClockFallback } from "@/components/scene/scenes/candle-clock-fallback";
import { Button } from "@/components/ui/button";
import { cx } from "@/components/ui/cx";
import { AlertIcon, CandleLitIcon, CrackIcon, ReplayIcon } from "@/components/ui/icons";
import { Kbd } from "@/components/ui/kbd";
import type { NightEvent } from "@/lib/executor/types";
import {
  BEAT_MS,
  dialHour,
  nightTimeline,
  type NightBeat,
  type NightCheckpointView,
  type NightSchedule,
  type NightTimeline as Timeline,
  type NightVerdict,
} from "@/lib/run/night-timeline";

const loadCandleClock: SceneLoader<Application, CandleClockProps> = () =>
  import("@/components/scene/scenes/candle-clock").then((scene) => scene.candleClockScene);

/** A breath before the first batch lands, so the player sees the empty night first. */
const OPENING_MS = 500;

export interface NightTimelineProps {
  readonly schedule: NightSchedule;
  /** Every event the player's Run the night yielded, in timeline order. */
  readonly events: readonly NightEvent[];
  /** The server's judgement of those events. */
  readonly verdict: NightVerdict;
  /** The final frame's action: on to the hour cleared, or the candle lost. */
  readonly onContinue: () => void;
  /** Called once, when the final frame shows: played out or skipped. */
  readonly onSettled?: (timeline: Timeline) => void;
}

type Outcome = NightBeat["outcome"];

/** What the first `shown` beats have revealed. */
function revealed(beats: readonly NightBeat[], shown: number) {
  const batches = new Map<number, Outcome>();
  const checkpoints = new Map<string, Outcome>();
  let replay: Outcome | null = null;
  let latest: number | null = null;
  for (const beat of beats.slice(0, shown)) {
    if (beat.kind === "batch") {
      batches.set(beat.batch, beat.outcome);
      latest = beat.batch;
    } else if (beat.kind === "replay") replay = beat.outcome;
    else checkpoints.set(beat.checkpointId, beat.outcome);
  }
  return { batches, checkpoints, replay, latest };
}

function title(timeline: Timeline, checkpoints: readonly NightCheckpointView[]): string {
  const { failure } = timeline;
  if (!failure) return "The night held";
  switch (failure.kind) {
    case "batch":
      return `The night stopped at batch ${String(failure.batch + 1)}`;
    case "replay":
      return failure.outcome === "flinched"
        ? `Batch ${String(failure.batch + 1)} flinched`
        : `The night stopped at batch ${String(failure.batch + 1)}`;
    case "checkpoint": {
      const label = checkpoints.find((c) => c.id === failure.checkpointId)?.label ?? "";
      return failure.outcome === "cracked"
        ? `The ${label} checkpoint cracked`
        : `The ${label} checkpoint could not be read`;
    }
  }
}

/** Where the night broke, in the town's words. Never why: no expected rows, no hashes. */
function summary(timeline: Timeline, schedule: NightSchedule, verdict: NightVerdict): string {
  const { failure, error } = timeline;
  const batchName = (index: number) => `batch ${String(index + 1)}`;
  const at = (index: number) => schedule.batches[index]?.arrivesAt ?? "";
  if (!failure || verdict.survived) {
    const replayed =
      schedule.replayBatch === null
        ? ""
        : ` ${capitalize(batchName(schedule.replayBatch))} ran twice and gold held still.`;
    return `All ${String(schedule.batches.length)} batches landed and every checkpoint held.${replayed}`;
  }
  const revealedBatch = schedule.batches[verdict.revealedBatch];
  const reveal = revealedBatch?.hidden
    ? ` ${capitalize(batchName(verdict.revealedBatch))} is now yours to query.`
    : "";
  const model = error?.model ?? "A model";
  switch (failure.kind) {
    case "batch":
      return `${model} failed to run on ${batchName(failure.batch)}, which landed at ${at(failure.batch)}.${reveal}`;
    case "replay":
      return failure.outcome === "flinched"
        ? `${capitalize(batchName(failure.batch))} ran a second time and gold changed.${reveal}`
        : `${model} failed when ${batchName(failure.batch)} ran a second time.${reveal}`;
    case "checkpoint": {
      const label = schedule.checkpoints.find((c) => c.id === failure.checkpointId)?.label ?? "";
      return failure.outcome === "cracked"
        ? `Gold was wrong when the town read it at ${label}, after ${batchName(failure.batch)} landed.${reveal}`
        : `${model} could not be read at ${label}.${reveal}`;
    }
  }
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/**
 * Run the night as a moment (art direction §6.4): the hour's batches land on a timeline one by
 * one, each checkpoint holds or cracks, the replay holds or flinches, and the clock sweeps to
 * each batch's time. It plays what the night really did and freezes on the first failure,
 * showing where the night broke and never why. A button or Escape skips to the final frame;
 * under reduced motion each beat appears in place.
 */
export function NightTimeline({
  schedule,
  events,
  verdict,
  onContinue,
  onSettled,
}: NightTimelineProps) {
  const timeline = useMemo(
    () => nightTimeline(schedule, events, verdict),
    [schedule, events, verdict],
  );
  const { beats } = timeline;
  const [shown, setShown] = useState(0);
  const settled = shown >= beats.length;
  const titleId = useId();
  const skipRef = useRef<HTMLButtonElement>(null);
  const continueRef = useRef<HTMLButtonElement>(null);
  const reported = useRef(false);

  const skip = useCallback(() => {
    setShown(beats.length);
  }, [beats.length]);

  useEffect(() => {
    skipRef.current?.focus();
  }, []);

  useEffect(() => {
    if (settled) return;
    const previous = beats[shown - 1];
    const timer = setTimeout(
      () => {
        setShown(shown + 1);
      },
      previous ? BEAT_MS[previous.kind] : OPENING_MS,
    );
    return () => {
      clearTimeout(timer);
    };
  }, [beats, shown, settled]);

  useEffect(() => {
    if (settled) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      event.preventDefault();
      skip();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
    };
  }, [settled, skip]);

  useEffect(() => {
    if (!settled || reported.current) return;
    reported.current = true;
    onSettled?.(timeline);
    // Only take focus the Skip button held, or that nothing held; never pull it from elsewhere.
    const active = document.activeElement;
    if (active === null || active === document.body || active === skipRef.current) {
      continueRef.current?.focus();
    }
  }, [settled, timeline, onSettled]);

  const view = revealed(beats, shown);
  const count = schedule.batches.length;
  const clockBatch = schedule.batches[view.latest ?? 0];
  const clockText = clockBatch?.arrivesAt ?? "";
  const hour = dialHour(clockText) ?? START_HOUR;
  const broke = settled && timeline.failure !== null;
  const sceneProps = useMemo<CandleClockProps>(
    () => ({ flame: broke ? "guttering" : "idle", hour }),
    [broke, hour],
  );
  const heading = settled ? title(timeline, schedule.checkpoints) : "Running the night";
  const landedCount = [...view.batches.values()].filter((outcome) => outcome === "landed").length;
  const fill = view.latest === null ? 0 : (view.latest + 0.5) / count;
  const groups = groupCheckpoints(schedule.checkpoints);

  return (
    <section
      aria-labelledby={titleId}
      data-night-state={settled ? (broke ? "broke" : "survived") : "running"}
      className="flex flex-col gap-8 bg-panel px-8 py-7"
    >
      <div className="flex items-center gap-6">
        <Scene
          scene={loadCandleClock}
          sceneProps={sceneProps}
          label={`The night clock reads ${clockText}.`}
          fallback={<CandleClockFallback hour={hour} />}
          className="aspect-[16/9] w-56 shrink-0 bg-inset"
        />
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <h2
            id={titleId}
            className={cx("text-balance type-display-m", broke ? "text-snuffed" : "text-parchment")}
          >
            {heading}
          </h2>
          <p className="flex items-baseline gap-3">
            <span className="text-parchment type-clock">{clockText}</span>
            <span className="text-ash type-ui">
              {String(landedCount)} of {String(count)} batches landed
            </span>
          </p>
        </div>
        {settled ? (
          <Button ref={continueRef} variant="secondary" size="lg" onClick={onContinue}>
            Continue
          </Button>
        ) : (
          <Button ref={skipRef} variant="ghost" size="lg" aria-keyshortcuts="Escape" onClick={skip}>
            Skip <Kbd aria-hidden="true">Esc</Kbd>
          </Button>
        )}
      </div>

      <div className="flex flex-col gap-3 px-6">
        <ol aria-label="Checkpoints" className="relative h-16">
          {groups.map(([afterBatch, checkpoints]) => (
            <li
              key={afterBatch}
              className="absolute bottom-0 flex -translate-x-1/2 gap-4"
              style={{ left: `${String(((afterBatch + 1) / count) * 100)}%` }}
            >
              {checkpoints.map((checkpoint) => (
                <CheckpointMark
                  key={checkpoint.id}
                  checkpoint={checkpoint}
                  outcome={view.checkpoints.get(checkpoint.id) ?? null}
                />
              ))}
            </li>
          ))}
        </ol>

        <div className="relative">
          <div
            aria-hidden="true"
            className="absolute inset-x-0 top-1/2 h-0.5 -translate-y-1/2 bg-line-strong"
          />
          <div
            aria-hidden="true"
            className="absolute inset-x-0 top-1/2 h-0.5 origin-left -translate-y-1/2 bg-flame transition-transform duration-scene ease-out"
            style={{ transform: `scaleX(${String(fill)})` }}
          />
          <ol
            aria-label="Batches"
            className="relative grid"
            style={{ gridTemplateColumns: `repeat(${String(count)}, minmax(0, 1fr))` }}
          >
            {schedule.batches.map((batch) => (
              <BatchMark
                key={batch.index}
                index={batch.index}
                arrivesAt={batch.arrivesAt}
                hidden={batch.hidden}
                outcome={view.batches.get(batch.index) ?? null}
              />
            ))}
          </ol>
        </div>

        <div
          aria-hidden="true"
          className="grid text-smoke type-data-s"
          style={{ gridTemplateColumns: `repeat(${String(count)}, minmax(0, 1fr))` }}
        >
          {schedule.batches.map((batch) => (
            <span key={batch.index} className="text-center">
              {String(batch.index + 1)}
            </span>
          ))}
        </div>

        {schedule.replayBatch === null ? null : (
          <div
            className="grid"
            style={{ gridTemplateColumns: `repeat(${String(count)}, minmax(0, 1fr))` }}
          >
            <ReplayMark
              batch={schedule.replayBatch}
              outcome={view.replay}
              style={{ gridColumnStart: schedule.replayBatch + 1 }}
            />
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-end justify-between gap-x-10 gap-y-4 px-6">
        <p
          className={cx(
            "min-h-13 max-w-reading text-pretty text-parchment type-prose-s transition-opacity duration-slow",
            settled ? "opacity-100" : "opacity-0",
          )}
        >
          {settled ? summary(timeline, schedule, verdict) : null}
        </p>
        <ul aria-label="Key" className="flex gap-6 text-ash type-ui-s">
          <li className="flex items-center gap-2">
            <span aria-hidden="true" className="size-3 rounded-xs bg-parchment" />
            Seen before the night
          </li>
          <li className="flex items-center gap-2">
            <span
              aria-hidden="true"
              className="size-3 rounded-xs border border-dashed border-ash"
            />
            Hidden until tonight
          </li>
        </ul>
      </div>

      <p role="status" className="sr-only">
        {settled ? `${heading}. ${summary(timeline, schedule, verdict)}` : "Running the night."}
      </p>
    </section>
  );
}

function groupCheckpoints(
  checkpoints: readonly NightCheckpointView[],
): (readonly [number, readonly NightCheckpointView[]])[] {
  const groups = new Map<number, NightCheckpointView[]>();
  for (const checkpoint of checkpoints) {
    const group = groups.get(checkpoint.afterBatch) ?? [];
    group.push(checkpoint);
    groups.set(checkpoint.afterBatch, group);
  }
  return [...groups];
}

const OUTCOME_WORD: Readonly<Record<Outcome, string>> = {
  landed: "landed",
  broke: "failed",
  passed: "held",
  held: "held",
  cracked: "cracked",
  flinched: "flinched",
};

function BatchMark({
  index,
  arrivesAt,
  hidden,
  outcome,
}: {
  readonly index: number;
  readonly arrivesAt: string;
  readonly hidden: boolean;
  readonly outcome: Outcome | null;
}) {
  const broke = outcome === "broke";
  const state = outcome === null ? "waiting" : OUTCOME_WORD[outcome];
  return (
    <li data-batch-outcome={outcome ?? "waiting"} className="flex justify-center py-1">
      <span
        className={cx(
          "relative grid size-4 place-items-center rounded-xs border bg-panel",
          hidden ? "border-dashed" : "border-solid",
          broke ? "border-snuffed" : "border-ash",
        )}
      >
        <span
          aria-hidden="true"
          className={cx(
            "size-2.5 rounded-xs transition-[translate,opacity] duration-scene ease-settle",
            "motion-calm:translate-y-0",
            broke ? "bg-snuffed" : "bg-parchment",
            outcome === null ? "-translate-y-4 opacity-0" : "translate-y-0 opacity-100",
          )}
        />
      </span>
      <span className="sr-only">
        Batch {String(index + 1)}, {arrivesAt}
        {hidden ? ", hidden until tonight" : ""}: {state}
      </span>
    </li>
  );
}

function CheckpointMark({
  checkpoint,
  outcome,
}: {
  readonly checkpoint: NightCheckpointView;
  readonly outcome: Outcome | null;
}) {
  const failed = outcome === "cracked" || outcome === "broke";
  const Icon = failed ? CrackIcon : CandleLitIcon;
  return (
    <span
      data-checkpoint-outcome={outcome ?? "waiting"}
      className={cx(
        "flex flex-col items-center gap-1 transition-colors duration-base",
        failed ? "text-snuffed" : outcome === null ? "text-smoke" : "text-flame",
      )}
    >
      <Icon className="size-6 shrink-0" />
      <span className="whitespace-nowrap type-data-s">
        <span
          className={failed ? "text-snuffed" : outcome === null ? "text-ash" : "text-parchment"}
        >
          {checkpoint.label}
        </span>{" "}
        <span className={cx(outcome === null && "sr-only")}>
          {outcome === null ? "waiting" : OUTCOME_WORD[outcome]}
        </span>
      </span>
    </span>
  );
}

function ReplayMark({
  batch,
  outcome,
  style,
}: {
  readonly batch: number;
  readonly outcome: Outcome | null;
  readonly style: { readonly gridColumnStart: number };
}) {
  const failed = outcome === "flinched" || outcome === "broke";
  return (
    <p
      data-replay-outcome={outcome ?? "waiting"}
      style={style}
      className={cx(
        "flex flex-col items-center gap-1 justify-self-center whitespace-nowrap type-data-s",
        failed ? "text-snuffed" : outcome === null ? "text-smoke" : "text-flame",
      )}
    >
      {failed ? <AlertIcon className="size-5" /> : <ReplayIcon className="size-5" />}
      <span>
        <span className={failed ? "text-snuffed" : "text-ash"}>Ran twice</span>
        <span className="sr-only"> (batch {String(batch + 1)})</span>
        {outcome === null ? (
          <span className="sr-only">, waiting</span>
        ) : (
          `, ${OUTCOME_WORD[outcome]}`
        )}
      </span>
    </p>
  );
}
