"use client";

import { useEffect, useState } from "react";
import type { SqlConnection } from "@/lib/executor/connection";
import { loadCatalog, type CatalogRelation } from "./catalog";

/** Reading the catalog for the first time, or waiting for the engine. */
export type TablesLoading = { readonly status: "loading" };

/** The engine could not list the tables. */
export type TablesFailed = {
  readonly status: "error";
  readonly message: string;
  readonly onRetry?: () => void;
};

/** The relations as the engine holds them now; possibly none. */
export type TablesReady = {
  readonly status: "ready";
  readonly relations: readonly CatalogRelation[];
};

export type TablesView = TablesLoading | TablesFailed | TablesReady;

/**
 * Reads the catalog through `connection` and again whenever `version` changes (bump it after
 * each batch lands or a preview runs). A reload keeps showing the last catalog until the new
 * one arrives, so the panel does not flash. `null` means the engine is not ready yet.
 */
export function useTableCatalog(connection: SqlConnection | null, version: unknown): TablesView {
  const [attempt, setAttempt] = useState(0);
  const [view, setView] = useState<TablesView>({ status: "loading" });

  useEffect(() => {
    if (connection === null) return;
    let live = true;
    loadCatalog(connection).then(
      (relations) => {
        if (live) setView({ status: "ready", relations });
      },
      (error: unknown) => {
        if (!live) return;
        setView({
          status: "error",
          message: error instanceof Error ? error.message : String(error),
          onRetry: () => {
            setView({ status: "loading" });
            setAttempt((n) => n + 1);
          },
        });
      },
    );
    return () => {
      live = false;
    };
  }, [connection, version, attempt]);

  return view;
}
