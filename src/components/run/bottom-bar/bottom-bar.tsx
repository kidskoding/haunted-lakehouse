"use client";

import type {
  RelicBarHour,
  RelicKind,
  RelicTarget,
  RelicView,
  RunButtonsView,
} from "@/lib/run/bottom-bar";
import { cx } from "@/components/ui/cx";
import { RelicBar } from "./relic-bar";
import { RunButtons } from "./run-buttons";

export interface BottomBarProps {
  readonly relics: readonly RelicView[];
  readonly hour: RelicBarHour;
  readonly run: RunButtonsView;
  readonly onUseRelic: (relic: RelicKind, target: RelicTarget | null) => void;
  readonly onPreview: () => void;
  readonly onRunNight: () => void;
  readonly className?: string;
}

/** The run screen's bottom bar (art direction §6.1): relics on the left, the run buttons on the right. */
export function BottomBar({
  relics,
  hour,
  run,
  onUseRelic,
  onPreview,
  onRunNight,
  className,
}: BottomBarProps) {
  return (
    <div
      role="group"
      aria-label="Relics and run"
      className={cx(
        "flex min-h-14 items-center justify-between gap-4 bg-night px-4 py-2",
        className,
      )}
    >
      <RelicBar relics={relics} hour={hour} onUse={onUseRelic} />
      <RunButtons view={run} onPreview={onPreview} onRunNight={onRunNight} />
    </div>
  );
}
