"use client";

import { useState } from "react";
import { TopBar } from "@/components/run/top-bar";
import { Button } from "@/components/ui/button";
import { ToastProvider, ToastViewport } from "@/components/ui/toast";
import { NIGHT, specimens } from "./fixtures";

const LIVE_TOTAL = 3;

/* One bar the player can play with: lose candles, move the night on, start over. */
function LiveSpecimen() {
  const [lit, setLit] = useState(LIVE_TOTAL);
  const [slot, setSlot] = useState(1);
  return (
    <section aria-labelledby="live" className="flex flex-col gap-4">
      <h2 id="live" className="px-6 text-parchment type-heading">
        Live
      </h2>
      <TopBar
        view={{
          candles: { lit, total: LIVE_TOTAL },
          slot,
          slots: NIGHT,
          seed: "raven-pumpkin-13",
          curse: null,
        }}
      />
      <div className="flex gap-3 px-6">
        <Button
          disabled={lit === 0}
          onClick={() => {
            setLit((n) => Math.max(n - 1, 0));
          }}
        >
          Blow out a candle
        </Button>
        <Button
          disabled={slot === NIGHT.length}
          onClick={() => {
            setSlot((n) => Math.min(n + 1, NIGHT.length));
          }}
        >
          Next hour
        </Button>
        <Button
          variant="quiet"
          onClick={() => {
            setLit(LIVE_TOTAL);
            setSlot(1);
          }}
        >
          Start the night over
        </Button>
      </div>
    </section>
  );
}

export function Gallery() {
  return (
    <ToastProvider>
      <main className="flex min-h-dvh flex-col gap-12 py-12">
        <header className="flex max-w-reading flex-col gap-3 px-6">
          <h1 className="text-balance text-parchment type-display-m">Top bar</h1>
          <p className="text-pretty text-ash type-prose">
            The run screen&apos;s top bar: candles, the night clock with a marker for every hour,
            the act, and the seed. Boss hours are diamonds; the 1:00am the clock passes twice wears
            a double ring. Each bar runs the full width, as on the run screen. This page exists only
            in development.
          </p>
        </header>
        <LiveSpecimen />
        {specimens.map((specimen) => (
          <section key={specimen.id} aria-labelledby={specimen.id} className="flex flex-col gap-4">
            <h2 id={specimen.id} className="px-6 text-parchment type-heading">
              {specimen.title}
            </h2>
            <TopBar view={specimen.view} />
          </section>
        ))}
      </main>
      <ToastViewport />
    </ToastProvider>
  );
}
