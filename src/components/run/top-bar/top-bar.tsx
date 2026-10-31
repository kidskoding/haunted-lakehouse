"use client";

import { Button } from "@/components/ui/button";
import { cx } from "@/components/ui/cx";
import { CopyIcon } from "@/components/ui/icons";
import { useToast } from "@/components/ui/toast";
import { Tooltip } from "@/components/ui/tooltip";
import { Candles } from "./candles";
import { actName, currentSlot } from "./clock";
import { NightClock } from "./night-clock";
import type { ActNumber, TopBarView } from "./types";

function ActIndicator({ act }: { readonly act: ActNumber }) {
  const { numeral, name } = actName(act);
  return (
    <p className="flex flex-col items-end">
      <span aria-hidden="true" className="text-parchment type-ui-l">
        Act {numeral}
      </span>
      <span aria-hidden="true" className="text-ash type-ui">
        {name}
      </span>
      <span className="sr-only">
        Act {act}: {name}
      </span>
    </p>
  );
}

function SeedButton({ seed }: { readonly seed: string }) {
  const { show } = useToast();

  async function copy() {
    try {
      await navigator.clipboard.writeText(seed);
      show({ tone: "success", title: "Seed copied", description: seed });
    } catch {
      show({
        tone: "error",
        title: "The seed didn't copy",
        description: `The browser kept the clipboard shut. The seed is ${seed}.`,
      });
    }
  }

  return (
    <Tooltip content="Copy the seed to replay this night" side="bottom">
      <Button variant="ghost" onClick={() => void copy()}>
        <span className="font-normal">Seed</span>
        <span className="font-normal text-parchment type-data">{seed}</span>
        <span className="sr-only">(copy)</span>
        <CopyIcon />
      </Button>
    </Tooltip>
  );
}

export interface TopBarProps {
  readonly view: TopBarView;
  readonly className?: string;
}

/**
 * The run screen's top bar: candles on the left, the night clock in the middle, the act and
 * a copyable seed on the right. It sits on `night`, outside the panels. Copying the seed
 * reports through the toast stack, so render it inside a `ToastProvider`.
 */
export function TopBar({ view, className }: TopBarProps) {
  const now = currentSlot(view);
  return (
    <header
      aria-label="The night so far"
      className={cx(
        // The clock holds the centre while the sides have room; at the tightest widths it gives way.
        "grid h-16 grid-cols-[minmax(max-content,1fr)_auto_minmax(max-content,1fr)] items-center",
        "gap-6 bg-night px-6",
        className,
      )}
    >
      <Candles lit={view.candles.lit} total={view.candles.total} />
      <NightClock view={view} />
      <div className="flex items-center gap-4 justify-self-end">
        <ActIndicator act={now.act} />
        <SeedButton seed={view.seed} />
      </div>
    </header>
  );
}
