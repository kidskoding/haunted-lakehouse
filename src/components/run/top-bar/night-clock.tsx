import { cx } from "@/components/ui/cx";
import { CandleGutteringIcon } from "@/components/ui/icons";
import { actName, clockLabel, currentSlot, dialAngle, slotSpoken } from "./clock";
import type { TopBarSlot, TopBarView } from "./types";

const TICKS = Array.from({ length: 12 }, (_, hour) => hour);

/* The dial's hand sweeps from hour to hour as a ceremony; calm motion shortens it via tokens. */
function Dial({ angle }: { readonly angle: number }) {
  return (
    <span aria-hidden="true" className="relative block size-9 shrink-0">
      <svg viewBox="0 0 36 36" focusable="false" className="absolute inset-0 size-full">
        <circle
          cx="18"
          cy="18"
          r="16.5"
          className="fill-panel stroke-line-strong"
          strokeWidth="1.5"
        />
        {TICKS.map((hour) => (
          <line
            key={hour}
            x1="18"
            y1={hour % 3 === 0 ? 4.5 : 5.5}
            x2="18"
            y2="7"
            className="stroke-faint"
            strokeWidth="1.5"
            strokeLinecap="round"
            transform={`rotate(${String(hour * 30)} 18 18)`}
          />
        ))}
      </svg>
      <svg
        viewBox="0 0 36 36"
        focusable="false"
        className="absolute inset-0 size-full transition-[rotate] duration-ceremony ease-inout"
        style={{ rotate: `${String(angle)}deg` }}
      >
        <line
          x1="18"
          y1="20"
          x2="18"
          y2="8"
          className="stroke-flame"
          strokeWidth="2"
          strokeLinecap="round"
        />
        <circle cx="18" cy="8" r="1.75" className="fill-glow" />
        <circle cx="18" cy="18" r="2.5" className="fill-flame" />
      </svg>
    </span>
  );
}

/** The boss shape, shared by the track's markers and the "Boss hour" flag so one teaches the other. */
function BossMark({ className }: { readonly className?: string }) {
  return <span aria-hidden="true" className={cx("block size-2.5 rotate-45", className)} />;
}

type Passage = "passed" | "now" | "ahead";

/*
 * A marker says three things without colour alone: its shape (diamond for a boss, round for
 * any other hour), its fill (solid once passed, hollow ahead, large and ringed now), and a
 * double ring for the hour the clock passes through twice.
 */
function Marker({ slot, passage }: { readonly slot: TopBarSlot; readonly passage: Passage }) {
  const shape = slot.boss ? "rotate-45" : "rounded-full";
  const fill = {
    passed: "bg-ash",
    now: "bg-flame",
    ahead: "border-2 border-line-control bg-night",
  }[passage];
  if (!slot.repeat) {
    return (
      <span
        className={cx(
          "block",
          shape,
          fill,
          passage === "now" ? "size-3.5 outline-2 outline-offset-2 outline-flame" : "size-3",
        )}
      />
    );
  }
  const ring = { passed: "border-ash", now: "border-flame", ahead: "border-line-control" }[passage];
  return (
    <span className={cx("flex size-5 items-center justify-center border-2 bg-night", shape, ring)}>
      {/* The outer ring already turns a boss diamond, so the inner mark only needs rounding. */}
      <span className={cx("block size-2", !slot.boss && "rounded-full", fill)} />
    </span>
  );
}

function Track({
  slots,
  current,
}: {
  readonly slots: readonly TopBarSlot[];
  readonly current: number;
}) {
  return (
    <ol aria-label="The night's hours" className="relative flex items-center gap-1.5 pb-4">
      <span
        aria-hidden="true"
        className="absolute inset-x-2 top-2.5 h-0.5 -translate-y-1/2 bg-line-strong"
      />
      {slots.map((slot, index) => {
        const opensAct = index === 0 || slots[index - 1]?.act !== slot.act;
        const passage: Passage =
          slot.slot < current ? "passed" : slot.slot === current ? "now" : "ahead";
        return (
          <li
            key={slot.slot}
            className={cx(
              "relative flex size-5 items-center justify-center",
              opensAct && index > 0 && "ms-3",
            )}
          >
            <Marker slot={slot} passage={passage} />
            <span className="sr-only">{slotSpoken(slot, current)}</span>
            {opensAct ? (
              <span aria-hidden="true" className="absolute top-full left-0 text-smoke type-ui-s">
                {actName(slot.act).numeral}
              </span>
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}

/**
 * The night clock: a dial, the hour's time in the clock face, the hour's flags (boss, curse),
 * and a track with a marker for every hour of the night, grouped by act.
 */
export function NightClock({
  view,
}: {
  readonly view: Pick<TopBarView, "slot" | "slots" | "curse">;
}) {
  const now = currentSlot(view);
  return (
    <div className="flex items-center gap-3">
      <Dial angle={dialAngle(now.time)} />
      <div className="flex w-40 flex-col gap-0.5">
        <p className="flex items-baseline gap-2">
          <span className="text-parchment type-clock">{clockLabel(now.time)}</span>
          {now.repeat ? (
            <span className="text-ash italic type-prose-s">
              again<span className="sr-only">, the second time tonight</span>
            </span>
          ) : null}
        </p>
        {now.boss || view.curse !== null ? (
          <p className="flex items-center gap-3 type-ui-s">
            {now.boss ? (
              <span className="flex items-center gap-1.5 text-parchment">
                <BossMark className="size-2 bg-flame" />
                Boss hour
              </span>
            ) : null}
            {view.curse !== null ? (
              <span className="flex items-center gap-1 text-tallow">
                <CandleGutteringIcon className="size-4 shrink-0" />
                {view.curse}
              </span>
            ) : null}
          </p>
        ) : null}
      </div>
      <Track slots={view.slots} current={now.slot} />
    </div>
  );
}
