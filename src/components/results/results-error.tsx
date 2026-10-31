"use client";

import { useEffect, useId, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { AlertIcon } from "@/components/ui/icons";
import { ResultsToolbar } from "./results-grid";

const STATUS_MS = 4000;

export interface ResultsErrorProps {
  /**
   * What went wrong, in the player's language: "DuckDB rejected the SQL" or
   * "The engine isn't ready yet."
   */
  readonly message: string;
  /**
   * The engine's own words, when they help: the DuckDB binder message, a stack
   * fragment. Copied with the message when the player asks for details.
   */
  readonly details?: string;
  /** Optional recovery actions (Retry). */
  readonly children?: ReactNode;
}

/**
 * A failed query: alert chrome, the message, optional engine details, and a
 * Copy details action. Shares the results toolbar so the panel frame doesn't jump.
 */
export function ResultsError({ message, details, children }: ResultsErrorProps) {
  const detailsId = useId();
  const [status, setStatus] = useState("");

  useEffect(() => {
    if (status === "") return;
    const timer = setTimeout(() => {
      setStatus("");
    }, STATUS_MS);
    return () => {
      clearTimeout(timer);
    };
  }, [status]);

  async function copyDetails() {
    const text = details === undefined || details === "" ? message : `${message}\n\n${details}`;
    try {
      await navigator.clipboard.writeText(text);
      setStatus("Copied the error details");
    } catch {
      setStatus("Couldn't copy: the browser blocked the clipboard.");
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-panel">
      <ResultsToolbar>
        <p className="type-ui-s text-snuffed">Query failed</p>
        <p role="status" className="ms-auto truncate type-ui-s text-flame">
          {status}
        </p>
        <Button size="sm" variant="ghost" onClick={() => void copyDetails()}>
          Copy details
        </Button>
        {children}
      </ResultsToolbar>

      <div className="min-h-0 flex-1 overflow-auto p-4">
        <div role="alert" className="flex flex-col gap-3 rounded-xs bg-tint-snuffed px-4 py-3">
          <p className="flex items-start gap-2 text-parchment type-ui">
            <AlertIcon className="mt-0.5 size-4 shrink-0 text-snuffed" />
            <span>{message}</span>
          </p>
          {details !== undefined && details !== "" ? (
            <pre
              id={detailsId}
              tabIndex={0}
              aria-label="Engine error details"
              className="max-h-48 overflow-auto rounded-xs bg-inset px-3 py-2 text-ash type-code whitespace-pre-wrap break-words"
            >
              {details}
            </pre>
          ) : null}
        </div>
      </div>
    </div>
  );
}
