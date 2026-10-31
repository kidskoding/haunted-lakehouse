"use client";

import { useState } from "react";
import { BottomBar } from "@/components/run/bottom-bar";
import { Button } from "@/components/ui/button";
import type {
  RelicBarHour,
  RelicKind,
  RelicTarget,
  RelicView,
  RunButtonsView,
} from "@/lib/run/bottom-bar";

const hour: RelicBarHour = {
  phase: "in-hour",
  darkness: false,
  boss: false,
  feeds: ["bronze.porch_events", "bronze.sensor_pings"],
  hiddenBatches: [
    { index: 3, arrivesAt: "6:40pm" },
    { index: 4, arrivesAt: "6:50pm" },
    { index: 5, arrivesAt: "6:58pm" },
  ],
  goldTables: ["gold.lights_on", "gold.silent_houses"],
  nextCheckpoint: "7:00pm",
};

const ready: RunButtonsView = {
  engine: "ready",
  activity: "idle",
  compileError: null,
  boss: false,
  candles: 3,
};

interface Specimen {
  readonly id: string;
  readonly title: string;
  readonly hour: RelicBarHour;
  readonly run: RunButtonsView;
  /** Relics spent this hour, still shown on the bar. */
  readonly used?: readonly RelicKind[];
  readonly empty?: boolean;
}

const specimens: readonly Specimen[] = [
  { id: "open", title: "Open hour", hour, run: ready },
  { id: "darkness", title: "Curse of Darkness", hour: { ...hour, darkness: true }, run: ready },
  { id: "boss", title: "Boss hour", hour: { ...hour, boss: true }, run: { ...ready, boss: true } },
  { id: "spent", title: "Spent relic", hour, run: ready, used: ["hourglass"] },
  { id: "between", title: "Between hours", hour: { ...hour, phase: "choosing" }, run: ready },
  { id: "warming", title: "Engine warming", hour, run: { ...ready, engine: "warming" } },
  { id: "previewing", title: "Previewing", hour, run: { ...ready, activity: "previewing" } },
  { id: "running", title: "Running", hour, run: { ...ready, activity: "running" } },
  { id: "compile", title: "Compile error", hour, run: { ...ready, compileError: "silver_lights" } },
  { id: "last", title: "Last candle", hour, run: { ...ready, candles: 1 } },
  { id: "empty", title: "No relics", hour, run: ready, empty: true },
];

function describeTarget(target: RelicTarget | null): string {
  if (target === null) return "";
  switch (target.kind) {
    case "feed":
      return ` on ${target.feed}`;
    case "batch":
      return ` on batch ${String(target.batch + 1)}`;
    case "table":
      return ` on ${target.table}`;
  }
}

export function Gallery({ relics }: { relics: readonly RelicView[] }) {
  const [activeId, setActiveId] = useState("open");
  const [log, setLog] = useState("Nothing yet.");
  const active = specimens.find((specimen) => specimen.id === activeId) ?? specimens[0];
  if (!active) return null;

  const shown = active.empty
    ? []
    : relics.map((relic) => ({ ...relic, used: active.used?.includes(relic.kind) ?? false }));
  const nameOf = (kind: RelicKind) => relics.find((relic) => relic.kind === kind)?.name ?? kind;

  return (
    <main className="mx-auto flex min-h-dvh max-w-page flex-col gap-10 px-8 py-12">
      <header className="flex max-w-reading flex-col gap-3">
        <h1 className="text-balance text-parchment type-display-m">Bottom bar</h1>
        <p className="text-pretty text-ash type-prose">
          The run screen&apos;s relic bar and run buttons, in every state they can be in. This page
          exists only in development.
        </p>
      </header>

      <nav aria-label="Bottom bar specimens" className="flex flex-wrap gap-1.5">
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
              }}
            >
              {specimen.title}
            </Button>
          );
        })}
      </nav>

      {/* Room above the bar, so its tooltips open where they will on the run screen. */}
      <section aria-label={active.title} className="flex flex-col justify-end bg-panel pt-48">
        <BottomBar
          key={active.id}
          relics={shown}
          hour={active.hour}
          run={active.run}
          onUseRelic={(kind, target) => {
            setLog(`Used ${nameOf(kind)}${describeTarget(target)}.`);
          }}
          onPreview={() => {
            setLog("Preview started.");
          }}
          onRunNight={() => {
            setLog("The night is running.");
          }}
        />
      </section>

      <p className="text-ash type-ui" aria-live="polite">
        Last action: <span className="text-parchment">{log}</span>
      </p>

      <section className="flex max-w-reading flex-col gap-2">
        <h2 className="text-parchment type-heading">How to try it</h2>
        <ul className="list-disc space-y-1 ps-5 text-ash type-prose-s">
          <li>Tab to a relic to read its tooltip; Enter opens its target picker or its confirm.</li>
          <li>Ctrl/Cmd+Enter previews; Ctrl/Cmd+Shift+Enter asks to run the night.</li>
          <li>Unavailable controls stay focusable and say why in their tooltip.</li>
        </ul>
      </section>
    </main>
  );
}
