"use client";

import { useEffect, useMemo, useState } from "react";
import { TableBrowser, useTableCatalog, type TablesView } from "@/components/run/tables";
import { Button } from "@/components/ui/button";
import { Panel, PanelHeader, PanelTitle } from "@/components/ui/panel";
import { useEngine } from "@/lib/engine/react";
import { engineConnection } from "@/lib/executor/engine-connection";
import type { SqlConnection } from "@/lib/executor/connection";
import { DELIVERED, fixtureNight, RETENTION } from "./fixtures";

type SpecimenId = "live" | "loading" | "empty" | "error";

const specimens: readonly { readonly id: SpecimenId; readonly title: string }[] = [
  { id: "live", title: "Fixture night" },
  { id: "loading", title: "Loading" },
  { id: "empty", title: "Nothing landed" },
  { id: "error", title: "Engine error" },
];

/** Loads the fixture night into the page's real DuckDB-WASM engine, then reads it back. */
function useFixtureCatalog(): TablesView {
  const { client } = useEngine();
  const connection = useMemo(() => engineConnection(client), [client]);
  const [loaded, setLoaded] = useState<SqlConnection | null>(null);
  const [failure, setFailure] = useState<string | null>(null);

  useEffect(() => {
    const abort = new AbortController();
    void (async () => {
      try {
        // Stop at once when unmounted (Strict Mode mounts twice), so two loads never interleave.
        for (const sql of fixtureNight()) {
          if (abort.signal.aborted) return;
          await connection.run(sql);
        }
        if (!abort.signal.aborted) setLoaded(connection);
      } catch (error) {
        if (!abort.signal.aborted)
          setFailure(error instanceof Error ? error.message : String(error));
      }
    })();
    return () => {
      abort.abort();
    };
  }, [connection]);

  const view = useTableCatalog(loaded, 0);
  return failure === null ? view : { status: "error", message: failure };
}

export function Gallery() {
  const [active, setActive] = useState<SpecimenId>("live");
  const [picks, setPicks] = useState<string[]>([]);
  const live = useFixtureCatalog();

  const view = ((): TablesView => {
    switch (active) {
      case "live":
        return live;
      case "loading":
        return { status: "loading" };
      case "empty":
        return { status: "ready", relations: [] };
      case "error":
        return {
          status: "error",
          message: "The engine failed to load.",
          onRetry: () => {
            setActive("live");
          },
        };
    }
  })();

  return (
    <main className="mx-auto flex min-h-dvh max-w-page flex-col gap-10 px-8 py-12">
      <header className="flex max-w-reading flex-col gap-3">
        <h1 className="text-balance text-parchment type-display-m">Table browser</h1>
        <p className="text-pretty text-ash type-prose">
          The run screen&apos;s Tables panel, reading a fixture night from the real DuckDB-WASM
          engine: two bronze feeds after six batches with three kept, a silver view, and a gold
          table. This page exists only in development.
        </p>
      </header>

      <nav aria-label="Table browser specimens" className="flex flex-wrap gap-1.5">
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

      <div className="grid grid-cols-[minmax(0,26rem)_minmax(0,1fr)] items-start gap-8">
        <Panel className="h-[min(70vh,40rem)] rounded-s">
          <PanelHeader>
            <PanelTitle>Tables</PanelTitle>
          </PanelHeader>
          <div className="min-h-0 flex-1 overflow-auto">
            <TableBrowser
              view={view}
              retention={{ keeps: RETENTION, delivered: DELIVERED }}
              onPick={(column, relation) => {
                setPicks((previous) => [`${relation.id}.${column}`, ...previous].slice(0, 6));
              }}
            />
          </div>
        </Panel>

        <section aria-labelledby="pick-log-title" className="flex flex-col gap-3">
          <h2 id="pick-log-title" className="text-parchment type-heading">
            Picked columns
          </h2>
          {picks.length === 0 ? (
            <p className="text-ash type-prose-s">
              Click a column, or focus one and press Enter. Its name would land in the editor.
            </p>
          ) : (
            <ol aria-live="polite" className="flex flex-col gap-1 text-parchment type-data">
              {picks.map((pick, index) => (
                // Picks repeat, so the position is the identity.
                <li key={index}>{pick}</li>
              ))}
            </ol>
          )}
          <ul className="mt-4 list-disc space-y-1 ps-5 text-ash type-prose-s">
            <li>Tab into a layer, then Up and Down to move, Home and End to jump.</li>
            <li>Right opens a table or steps into its columns; Left closes it or climbs out.</li>
            <li>Enter or Space opens a table, or picks the focused column.</li>
          </ul>
        </section>
      </div>
    </main>
  );
}
