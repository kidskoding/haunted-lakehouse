"use client";

import { useEffect, useRef, useState } from "react";
import {
  nightStakes,
  previewBlockedReason,
  runBlockedReason,
  type RunButtonsView,
} from "@/lib/run/bottom-bar";
import { Button } from "@/components/ui/button";
import { cx } from "@/components/ui/cx";
import { Dialog, DialogActions, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { AlertIcon, CandleGutteringIcon, CandleLitIcon } from "@/components/ui/icons";
import { Shortcut, usePlatform } from "@/components/ui/kbd";
import { ariaKeyShortcuts } from "@/components/ui/shortcut";
import { Tooltip } from "@/components/ui/tooltip";

/* The same chords the editor binds (5.3.6), so they work wherever focus is on the run screen. */
const PREVIEW_KEYS = ["Mod", "Enter"] as const;
const RUN_KEYS = ["Mod", "Shift", "Enter"] as const;

export interface RunButtonsProps {
  readonly view: RunButtonsView;
  readonly onPreview: () => void;
  /** Called only after the player confirms the stakes. */
  readonly onRunNight: () => void;
  readonly className?: string;
}

function candleWord(count: number): string {
  return count === 1 ? "1 candle" : `${String(count)} candles`;
}

function NightConfirm({
  view,
  onCancel,
  onConfirm,
}: {
  view: RunButtonsView;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const stakes = nightStakes(view.boss, view.candles);
  const atStake = Math.min(stakes.cost, view.candles);
  return (
    <Dialog
      open
      role={stakes.last ? "alertdialog" : "dialog"}
      closeOnBackdrop={false}
      onOpenChange={(open) => {
        if (!open) onCancel();
      }}
    >
      <DialogTitle>Run the night?</DialogTitle>
      <DialogDescription>
        The hour replays from its first batch, hidden ones included. {stakes.summary}
      </DialogDescription>
      <div className="flex items-center gap-3">
        <span aria-hidden="true" className="flex items-center gap-0.5">
          {Array.from({ length: view.candles }, (_, i) =>
            i >= view.candles - atStake ? (
              <CandleGutteringIcon key={i} className="size-5 text-tallow" />
            ) : (
              <CandleLitIcon key={i} className="size-5 text-flame" />
            ),
          )}
        </span>
        <p className="text-parchment type-ui">
          You hold {candleWord(view.candles)}. {candleWord(atStake)} at stake.
        </p>
      </div>
      {stakes.last ? (
        <p className="flex items-center gap-2 rounded-xs bg-tint-snuffed px-3 py-2 text-parchment type-ui">
          <AlertIcon className="size-4 shrink-0 text-snuffed" />
          {view.candles === 1 ? "This is your last candle." : "These are your last candles."} A
          break ends the run.
        </p>
      ) : null}
      <DialogActions>
        <Button variant="ghost" size="lg" data-autofocus onClick={onCancel}>
          Keep working
        </Button>
        <Button variant="destructive-confirm" size="lg" onClick={onConfirm}>
          Run the night
        </Button>
      </DialogActions>
    </Dialog>
  );
}

function TipContent({
  label,
  keys,
  reason,
}: {
  label: string;
  keys: readonly string[];
  reason: string | null;
}) {
  if (reason) return <span>{reason}</span>;
  return (
    <span className="flex items-center gap-2">
      {label}
      <Shortcut keys={keys} aria-hidden />
    </span>
  );
}

/**
 * Preview (free, as often as you like) and Run the night (the screen's one lit action, which
 * costs candles when it breaks, so it confirms first). Both answer their editor chords from
 * anywhere on the page, and say in their tooltip why they can't act.
 */
export function RunButtons({ view, onPreview, onRunNight, className }: RunButtonsProps) {
  const platform = usePlatform();
  const [confirming, setConfirming] = useState(false);
  const previewReason = previewBlockedReason(view);
  const runReason = runBlockedReason(view);
  const previewing = view.activity === "previewing";
  const running = view.activity === "running";

  const preview = () => {
    if (previewReason === null && !previewing) onPreview();
  };
  const requestRun = () => {
    if (runReason === null && !running) setConfirming(true);
  };

  // The listener reads the latest handlers through a ref, so it is attached once.
  const handlers = useRef({ preview, requestRun });
  useEffect(() => {
    handlers.current = { preview, requestRun };
  });
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      // The editor handles its own chords and marks them handled; an open dialog owns the keys.
      if (event.defaultPrevented || event.repeat || event.key !== "Enter") return;
      if (!(event.metaKey || event.ctrlKey) || event.altKey) return;
      if (document.querySelector("dialog[open]")) return;
      event.preventDefault();
      if (event.shiftKey) handlers.current.requestRun();
      else handlers.current.preview();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
    };
  }, []);

  return (
    <div className={cx("flex items-center gap-3", className)}>
      <Tooltip
        side="top-end"
        content={<TipContent label="Preview" keys={PREVIEW_KEYS} reason={previewReason} />}
      >
        <Button
          variant="secondary"
          size="lg"
          disabled={previewReason !== null}
          loading={previewing}
          aria-keyshortcuts={ariaKeyShortcuts(PREVIEW_KEYS, platform)}
          onClick={preview}
        >
          Preview
          <Shortcut keys={PREVIEW_KEYS} aria-hidden />
        </Button>
      </Tooltip>
      <Tooltip
        side="top-end"
        content={<TipContent label="Run the night" keys={RUN_KEYS} reason={runReason} />}
      >
        <Button
          variant="primary"
          size="lg"
          disabled={runReason !== null}
          loading={running}
          aria-haspopup="dialog"
          aria-keyshortcuts={ariaKeyShortcuts(RUN_KEYS, platform)}
          onClick={requestRun}
        >
          Run the night
          <Shortcut keys={RUN_KEYS} aria-hidden />
        </Button>
      </Tooltip>
      {confirming ? (
        <NightConfirm
          view={view}
          onCancel={() => {
            setConfirming(false);
          }}
          onConfirm={() => {
            setConfirming(false);
            // The pipeline or engine may have changed while the confirm was open.
            if (runReason === null && !running) onRunNight();
          }}
        />
      ) : null}
    </div>
  );
}
