"use client";

import { useState } from "react";
import { CandleLost } from "@/components/run/candle-lost";
import { Button } from "@/components/ui/button";
import type { Specimen } from "./fixtures";

export function Gallery({ specimens }: { readonly specimens: readonly Specimen[] }) {
  const [shown, setShown] = useState<string | null>(null);
  const specimen = specimens.find((candidate) => candidate.id === shown);

  return (
    <main className="mx-auto flex min-h-dvh max-w-page flex-col gap-10 px-8 py-12">
      <header className="flex max-w-reading flex-col gap-3">
        <h1 className="text-balance text-parchment type-display-m">Candle lost</h1>
        <p className="text-pretty text-ash type-prose">
          The moment after Run the night breaks with candles to spare. Each break is real data for
          the seed raven-pumpkin-13, with the reaction the narrative engine draws for it. Turn sound
          on from the sound page to hear the candle-out sting. This page exists only in development.
        </p>
      </header>
      <ul className="grid gap-x-8 gap-y-8 lg:grid-cols-2">
        {specimens.map(({ id, title, caption }) => (
          <li key={id} className="flex flex-col items-start gap-3">
            <h2 className="text-parchment type-heading">{title}</h2>
            <p className="max-w-reading text-pretty text-ash type-prose-s">{caption}</p>
            <Button
              variant="ghost"
              aria-label={`Show: ${title}`}
              onClick={() => {
                setShown(id);
              }}
            >
              Show
            </Button>
          </li>
        ))}
      </ul>
      {specimen ? (
        <CandleLost
          key={specimen.id}
          candles={specimen.candles}
          failure={specimen.failure}
          alreadyVisible={specimen.alreadyVisible}
          reaction={specimen.reaction}
          onDismiss={() => {
            setShown(null);
          }}
        />
      ) : null}
    </main>
  );
}
