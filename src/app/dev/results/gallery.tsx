"use client";

import { useMemo, useState } from "react";
import type { ResultsView } from "@/components/results";
import { ResultsPanel } from "@/components/results";
import { Button } from "@/components/ui/button";
import { cx } from "@/components/ui/cx";
import { binderError, emptyRows, manyRows, noColumns, porchLights, wideSchema } from "./fixtures";

type SpecimenId =
  "porch" | "wide" | "tall" | "empty" | "no-columns" | "limited" | "idle" | "loading" | "error";

const specimens: readonly { readonly id: SpecimenId; readonly title: string }[] = [
  { id: "porch", title: "Porch lights" },
  { id: "wide", title: "Wide schema" },
  { id: "tall", title: "2,000 rows" },
  { id: "empty", title: "No rows" },
  { id: "no-columns", title: "No columns" },
  { id: "limited", title: "Hit the row limit" },
  { id: "idle", title: "Idle" },
  { id: "loading", title: "Loading" },
  { id: "error", title: "SQL error" },
];

function viewFor(id: SpecimenId, tall: ReturnType<typeof manyRows>): ResultsView {
  switch (id) {
    case "porch":
      return { status: "ready", result: porchLights, label: "gold.porch_lights" };
    case "wide":
      return { status: "ready", result: wideSchema, label: "Wide schema" };
    case "tall":
      return { status: "ready", result: tall, label: "silver.bowl_takings" };
    case "empty":
      return { status: "ready", result: emptyRows, label: "Empty result" };
    case "no-columns":
      return { status: "ready", result: noColumns, label: "No columns" };
    case "limited":
      return {
        status: "ready",
        result: { ...porchLights, rows: porchLights.rows.slice(0, 5) },
        limit: 5,
        label: "Limited preview",
      };
    case "idle":
      return { status: "idle" };
    case "loading":
      return { status: "loading", label: "Running the preview" };
    case "error":
      return {
        status: "error",
        message: binderError.message,
        details: binderError.details,
      };
  }
}

export function Gallery() {
  const [active, setActive] = useState<SpecimenId>("porch");
  const [retries, setRetries] = useState(0);
  const tall = useMemo(() => manyRows(2_000), []);

  const view = useMemo((): ResultsView => {
    const base = viewFor(active, tall);
    if (base.status !== "error") return base;
    return {
      ...base,
      onRetry: () => {
        setRetries((n) => n + 1);
        setActive("porch");
      },
    };
  }, [active, tall]);

  return (
    <main className="mx-auto flex min-h-dvh max-w-page flex-col gap-10 px-8 py-12">
      <header className="flex max-w-reading flex-col gap-3">
        <h1 className="text-balance text-parchment type-display-m">Results grid</h1>
        <p className="text-pretty text-ash type-prose">
          The run screen&apos;s query results: a virtualized ARIA grid with resizable columns, TSV
          copy, and a clear error state. This page exists only in development.
        </p>
      </header>

      <nav aria-label="Result specimens" className="flex flex-wrap gap-1.5">
        {specimens.map((specimen) => {
          const selected = specimen.id === active;
          return (
            <Button
              key={specimen.id}
              size="sm"
              variant={selected ? "secondary" : "ghost"}
              aria-pressed={selected}
              onClick={() => {
                setActive(specimen.id);
              }}
            >
              {specimen.title}
            </Button>
          );
        })}
      </nav>

      <section
        aria-label={specimens.find((s) => s.id === active)?.title ?? "Results"}
        className={cx("h-[min(70vh,40rem)] overflow-hidden rounded-s border border-line-faint")}
      >
        <ResultsPanel view={view} />
      </section>

      {retries > 0 ? (
        <p className="type-ui-s text-smoke" aria-live="polite">
          Retried {String(retries)} {retries === 1 ? "time" : "times"}; showing porch lights.
        </p>
      ) : null}

      <section className="flex max-w-reading flex-col gap-2">
        <h2 className="text-parchment type-heading">How to try it</h2>
        <ul className="list-disc space-y-1 ps-5 text-ash type-prose-s">
          <li>Arrow keys move the active cell; Shift+arrows extend the selection.</li>
          <li>Ctrl/Cmd+C copies the selection as TSV; Copy all rows includes the header.</li>
          <li>Focus a column&apos;s resize handle and use Left/Right (Shift for bigger steps).</li>
          <li>The footer shows the full value of the active cell when it truncates in the grid.</li>
        </ul>
      </section>
    </main>
  );
}
