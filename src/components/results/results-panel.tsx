"use client";

import type { ReactNode } from "react";
import type { QueryResult } from "@/lib/engine/protocol";
import { Button } from "@/components/ui/button";
import { PanelEmpty, PanelSkeleton } from "@/components/ui/panel";
import { ResultsError } from "./results-error";
import { ResultsGrid, ResultsToolbar } from "./results-grid";

/** Idle: nothing has been queried yet this hour. */
export type ResultsIdle = { readonly status: "idle"; readonly hint?: string };

/** A query is in flight. */
export type ResultsLoading = { readonly status: "loading"; readonly label?: string };

/** The engine or the SQL rejected the query. */
export type ResultsFailed = {
  readonly status: "error";
  readonly message: string;
  readonly details?: string;
  readonly onRetry?: () => void;
};

/** A successful query, ready to browse. */
export type ResultsReady = {
  readonly status: "ready";
  readonly result: QueryResult;
  /** The row cap the query ran under; reaching it shows a truncation notice. */
  readonly limit?: number;
  readonly label?: string;
};

export type ResultsView = ResultsIdle | ResultsLoading | ResultsFailed | ResultsReady;

export interface ResultsPanelProps {
  readonly view: ResultsView;
  /** Extra recovery controls for the error state (beyond Retry). */
  readonly errorActions?: ReactNode;
}

/**
 * The results region of the run screen: idle, loading, error, or the virtualized
 * grid. Every state keeps the same outer chrome so the panel never jumps.
 */
export function ResultsPanel({ view, errorActions }: ResultsPanelProps) {
  switch (view.status) {
    case "idle":
      return (
        <div className="flex h-full min-h-0 flex-col bg-panel">
          <ResultsToolbar>
            <p className="type-ui-s text-smoke">No result yet</p>
          </ResultsToolbar>
          <div className="flex min-h-0 flex-1 items-center px-4">
            <PanelEmpty>
              {view.hint ?? "Preview a model or run a query; the rows land here."}
            </PanelEmpty>
          </div>
        </div>
      );
    case "loading":
      return (
        <div className="flex h-full min-h-0 flex-col bg-panel">
          <ResultsToolbar>
            <p className="type-ui-s text-ash">Running…</p>
          </ResultsToolbar>
          <div className="min-h-0 flex-1 px-4 py-4">
            <PanelSkeleton
              label={view.label ?? "Running the query"}
              lines={[0.88, 0.72, 0.94, 0.61]}
            />
          </div>
        </div>
      );
    case "error":
      return (
        <ResultsError
          message={view.message}
          {...(view.details !== undefined ? { details: view.details } : {})}
        >
          {view.onRetry ? (
            <Button size="sm" variant="ghost" onClick={view.onRetry}>
              Retry
            </Button>
          ) : null}
          {errorActions}
        </ResultsError>
      );
    case "ready":
      return (
        <ResultsGrid
          result={view.result}
          {...(view.limit !== undefined ? { limit: view.limit } : {})}
          {...(view.label !== undefined ? { label: view.label } : {})}
        />
      );
  }
}
