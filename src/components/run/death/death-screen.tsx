"use client";

import { useEffect, useEffectEvent, useId, useRef } from "react";
import type { TombstoneView } from "@/lib/run/tombstone";
import { useSound } from "@/lib/sound/react";
import { DeathActions } from "./death-actions";
import { Tombstone } from "./tombstone";

export interface DeathScreenProps {
  readonly stone: TombstoneView;
  /** The stone's share page, from the server's `tombstonePaths`. */
  readonly sharePath: string;
}

/**
 * The run's end: everything fades to `void`, then the stone rises with its three ways out.
 * It fills its nearest positioned ancestor, so the run screen mounts it in a fixed layer over
 * itself. Focus moves to the title, so a screen reader hears the death before the stone.
 */
export function DeathScreen({ stone, sharePath }: DeathScreenProps) {
  const { play } = useSound();
  const titleId = useId();
  const title = useRef<HTMLHeadingElement>(null);
  // Strict Mode runs mount effects twice; the sting must still sound once.
  const stung = useRef(false);

  const sting = useEffectEvent(() => {
    if (stung.current) return;
    stung.current = true;
    play("death");
  });

  useEffect(() => {
    title.current?.focus();
    sting();
  }, []);

  return (
    <section
      aria-labelledby={titleId}
      className="absolute inset-0 overflow-y-auto bg-void death-fade"
    >
      <div className="flex min-h-full flex-col items-center justify-center gap-8 px-4 py-12 tomb-rise">
        <h2
          id={titleId}
          ref={title}
          tabIndex={-1}
          className="text-balance text-center text-parchment type-display-l"
        >
          The last candle is out.
        </h2>
        <Tombstone stone={stone} />
        <DeathActions stone={stone} sharePath={sharePath} />
      </div>
    </section>
  );
}
