"use client";

import { useEffect, useEffectEvent, useRef } from "react";
import { StoryScene } from "@/components/run/story";
import { Candle } from "@/components/run/top-bar";
import { Button } from "@/components/ui/button";
import { Dialog, DialogActions, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import type { FailureReport } from "@/lib/executor/report";
import { useSound } from "@/lib/sound/react";
import type { RenderedLine } from "@/lib/story/types";
import { candleStates, Revealed, WhereItBroke } from "./break-report";

export interface CandleLostProps {
  /** Candles after the break: `lit` still burning, `lost` going out now (two on a boss). */
  readonly candles: { readonly lit: number; readonly lost: number; readonly total: number };
  /** Where the night broke, as the executor reports it. */
  readonly failure: FailureReport;
  /** The revealed batch was already open to the player before the night ran. */
  readonly alreadyVisible: boolean;
  /** The cast's reaction, already rendered by the narrative engine. */
  readonly reaction: readonly RenderedLine[];
  /** "Back to the pipeline": the player returns to the run screen. */
  readonly onDismiss: () => void;
}

const TITLES: Readonly<Record<number, string>> = {
  1: "A candle goes out",
  2: "Two candles go out",
};

/**
 * The moment after Run the night breaks with candles to spare: the lost candles gutter and go
 * out to the candle-out sting, the hour's cast reacts, and the break says where the night
 * stopped and which batch is now open in bronze, never why. Mount it to show it.
 */
export function CandleLost({
  candles: { lit, lost, total },
  failure,
  alreadyVisible,
  reaction,
  onDismiss,
}: CandleLostProps) {
  const { play } = useSound();
  // Strict Mode runs effects twice; the ref survives, so the sting sounds once per moment.
  const stung = useRef(false);
  const sting = useEffectEvent(() => {
    if (stung.current) return;
    stung.current = true;
    play("candle-out");
  });
  useEffect(() => {
    sting();
  }, []);

  const states = candleStates(lit, lost, total);
  return (
    <Dialog
      open
      role="alertdialog"
      closeOnBackdrop={false}
      onOpenChange={(open) => {
        if (!open) onDismiss();
      }}
      className="gap-6"
    >
      {/* The dialog arrives first, so the flame is seen burning before it gutters. */}
      <div
        aria-hidden="true"
        className="flex h-16 items-end gap-6 **:[animation-delay:var(--transition-duration-base)]"
      >
        {states.map((state, index) => (
          <span key={index} className="flex h-16 w-5 items-end justify-center">
            <span className="origin-bottom scale-200">
              <Candle state={state} />
            </span>
          </span>
        ))}
      </div>
      <div className="flex flex-col gap-1">
        <DialogTitle className="type-display-m">{TITLES[lost] ?? TITLES[1]}</DialogTitle>
        <p className="text-ash type-ui-l font-normal">
          {lit} of {total} {total === 1 ? "candle" : "candles"} still lit.
          {lost > 1 ? " A boss hour costs two." : null}
        </p>
      </div>
      {reaction.length > 0 ? <StoryScene lines={reaction} /> : null}
      <div className="flex flex-col gap-3 rounded-xs bg-tint-snuffed px-4 py-4">
        <DialogDescription className="text-pretty text-parchment">
          <WhereItBroke failure={failure} />
        </DialogDescription>
        {failure.kind === "error" ? (
          <pre className="overflow-x-auto rounded-xs bg-inset px-3 py-2 whitespace-pre-wrap text-parchment type-code">
            {failure.error.message}
          </pre>
        ) : null}
        <p className="text-pretty text-parchment type-ui-l font-normal">
          <Revealed batch={failure.revealedBatch} alreadyVisible={alreadyVisible} />
        </p>
      </div>
      <DialogActions>
        <Button variant="secondary" size="lg" data-autofocus onClick={onDismiss}>
          Back to the pipeline
        </Button>
      </DialogActions>
    </Dialog>
  );
}
