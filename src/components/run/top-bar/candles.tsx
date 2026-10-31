"use client";

import { useState } from "react";
import { cx } from "@/components/ui/cx";
import { justSnuffed } from "./clock";

type CandleState = "lit" | "guttering" | "out";

/*
 * A candle going out gutters over a scene beat: the flame leans, shrinks, and dies, then the
 * smoke curls up. Calm motion keeps the same story as one crossfade, lit to smoke.
 */
const flameGutter =
  "animate-[candle-gutter_var(--transition-duration-scene)_var(--ease-inout)_both] " +
  "motion-calm:animate-[candle-fade-out_var(--transition-duration-base)_var(--ease-out)_both]";
const smokeRise =
  "animate-[candle-smoke_var(--transition-duration-scene)_var(--ease-out)_both] " +
  "motion-calm:animate-[candle-fade-in_var(--transition-duration-base)_var(--ease-out)_both]";

function Candle({ state }: { readonly state: CandleState }) {
  return (
    <span className="relative block h-8 w-2.5" data-candle={state}>
      {state === "out" ? null : (
        <span
          className={cx(
            "absolute bottom-5 left-1/2 h-3 w-2 -translate-x-1/2 origin-bottom rounded-full",
            "bg-flame shadow-glow-candle",
            state === "guttering" && flameGutter,
          )}
        >
          <span className="absolute inset-x-0.5 bottom-0.5 h-1.5 rounded-full bg-glow" />
        </span>
      )}
      {state === "lit" ? null : (
        <svg
          viewBox="0 0 8 12"
          aria-hidden="true"
          focusable="false"
          className={cx(
            "absolute bottom-5 left-1/2 h-3 w-2 -translate-x-1/2 fill-none stroke-smoke",
            state === "guttering" && smokeRise,
          )}
        >
          <path
            d="M4 12c-2-1.5-2-3 0-4.5s2-3 0-4.5S2 0 4 0"
            strokeWidth="1.25"
            strokeLinecap="round"
          />
        </svg>
      )}
      <span className="absolute bottom-4 left-1/2 h-1 w-0.5 -translate-x-1/2 bg-faint" />
      <span
        className={cx(
          "absolute inset-x-0 bottom-0 h-4 rounded-xs transition-colors duration-scene ease-out",
          state === "lit" ? "bg-ash" : "bg-line-strong",
        )}
      />
    </span>
  );
}

export interface CandlesProps {
  readonly lit: number;
  readonly total: number;
}

/**
 * The run's candles, burning down from the right. A candle that goes out while the bar is on
 * screen gutters first; the count is a live status, so a screen reader hears each loss.
 */
export function Candles({ lit, total }: CandlesProps) {
  const [previous, setPrevious] = useState(lit);
  const [guttering, setGuttering] = useState<readonly number[]>([]);
  // Adjusting state while rendering (not in an effect), so the first frame already gutters.
  if (previous !== lit) {
    setPrevious(lit);
    setGuttering(justSnuffed(previous, lit));
  }

  const candles = Array.from({ length: total }, (_, index): CandleState => {
    if (index < lit) return "lit";
    return guttering.includes(index) ? "guttering" : "out";
  });
  const spoken = `${String(lit)} of ${String(total)} ${total === 1 ? "candle" : "candles"} lit`;

  return (
    <div className="flex items-center gap-3">
      <span aria-hidden="true" className="flex items-end gap-2.5">
        {candles.map((state, index) => (
          <Candle key={index} state={state} />
        ))}
      </span>
      <span aria-hidden="true" className="text-ash type-ui">
        {lit} of {total}
      </span>
      <span role="status" className="sr-only">
        {spoken}
      </span>
    </div>
  );
}
