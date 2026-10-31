"use client";

import { useState } from "react";
import { NightTimeline } from "@/components/run/night";
import { Button } from "@/components/ui/button";
import { specimens } from "./fixtures";

export function Gallery() {
  const [activeId, setActiveId] = useState("survived");
  const [take, setTake] = useState(0);
  const [log, setLog] = useState("Nothing yet.");
  const active = specimens.find((specimen) => specimen.id === activeId) ?? specimens[0];
  if (!active) return null;

  return (
    <main className="mx-auto flex min-h-dvh max-w-page flex-col gap-10 px-8 py-12">
      <header className="flex max-w-reading flex-col gap-3">
        <h1 className="text-balance text-parchment type-display-m">Run the night</h1>
        <p className="text-pretty text-ash type-prose">
          The night replayed from real executor output: batches land, checkpoints hold or crack, and
          the clock follows. This page exists only in development.
        </p>
      </header>

      <div className="flex flex-wrap items-center justify-between gap-4">
        <nav aria-label="Night specimens" className="flex flex-wrap gap-1.5">
          {specimens.map((specimen) => {
            const selected = specimen.id === active.id;
            return (
              <Button
                key={specimen.id}
                size="sm"
                variant={selected ? "secondary" : "ghost"}
                aria-pressed={selected}
                onClick={() => {
                  setActiveId(specimen.id);
                  setTake((n) => n + 1);
                }}
              >
                {specimen.title}
              </Button>
            );
          })}
        </nav>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => {
            setTake((n) => n + 1);
          }}
        >
          Play again
        </Button>
      </div>

      <NightTimeline
        key={`${active.id}-${String(take)}`}
        schedule={active.schedule}
        events={active.events}
        verdict={active.verdict}
        onSettled={(timeline) => {
          setLog(timeline.failure ? "The night froze on its first failure." : "The night held.");
        }}
        onContinue={() => {
          setLog("Continue pressed.");
        }}
      />

      <p className="text-ash type-ui" aria-live="polite">
        Last action: <span className="text-parchment">{log}</span>
      </p>
    </main>
  );
}
