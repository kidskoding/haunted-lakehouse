"use client";

import Image from "next/image";
import { useState } from "react";
import { DeathScreen } from "@/components/run/death";
import { Button } from "@/components/ui/button";
import type { TombstoneView } from "@/lib/run/tombstone";

export interface DeathSpecimen {
  readonly id: string;
  readonly title: string;
  readonly stone: TombstoneView;
  readonly sharePath: string;
  /** Null for an hour no run can play yet, which has no share card. */
  readonly imagePath: string | null;
}

export function Gallery({ specimens }: { readonly specimens: readonly DeathSpecimen[] }) {
  const [activeId, setActiveId] = useState(specimens[0]?.id ?? "");
  // Bumped to remount the moment, so it fades in again from the run screen.
  const [take, setTake] = useState(0);
  const active = specimens.find((specimen) => specimen.id === activeId) ?? specimens[0];
  if (!active) return null;

  return (
    <main className="mx-auto flex min-h-dvh max-w-page flex-col gap-8 px-4 py-12 md:px-8 3xl:max-w-none">
      <header className="flex max-w-reading flex-col gap-3">
        <h1 className="text-balance text-parchment type-display-m">Death</h1>
        <p className="text-pretty text-ash type-prose">
          The last candle going out: a fade to the void, then the run&rsquo;s stone, engraved by the
          narrative engine. Pick a death to play the moment again.
        </p>
      </header>
      <div role="group" aria-label="Deaths" className="flex flex-wrap gap-2">
        {specimens.map((specimen) => (
          <Button
            key={specimen.id}
            aria-pressed={specimen.id === active.id}
            variant={specimen.id === active.id ? "secondary" : "ghost"}
            onClick={() => {
              setActiveId(specimen.id);
              setTake((current) => current + 1);
            }}
          >
            {specimen.title}
          </Button>
        ))}
      </div>
      <div className="relative h-200 overflow-hidden bg-panel">
        <p className="p-8 text-ash type-prose">The run screen, a moment before the dark.</p>
        <DeathScreen key={`${active.id}-${String(take)}`} {...active} />
      </div>
      <section aria-labelledby="share-card" className="flex flex-col gap-4">
        <h2 id="share-card" className="text-parchment type-heading">
          Share card
        </h2>
        {active.imagePath ? (
          // The card is generated at the size it is shared at; optimizing it would only resize it.
          <Image
            unoptimized
            src={active.imagePath}
            width={1200}
            height={630}
            alt={`${active.stone.handle}'s tombstone: ${active.stone.epitaph}`}
            className="h-auto w-full max-w-150"
          />
        ) : (
          <p className="text-ash type-prose-s">
            No card: no run can play {active.stone.hour} yet, so no link can carry this stone.
          </p>
        )}
      </section>
    </main>
  );
}
