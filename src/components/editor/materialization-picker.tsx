"use client";

import { useState } from "react";
import type { Materialization } from "@/lib/pipeline/types";
import { cx } from "@/components/ui/cx";
import { parseKeyList, readConfig, writeConfig, type ConfigState } from "./config-edit";

export interface MaterializationPickerProps {
  readonly source: string;
  readonly onChange: (source: string) => void;
  /** The Purist cannot use `table`; the option stays visible but unavailable. */
  readonly tableDisabled?: boolean;
  readonly className?: string;
}

function materializationOf(state: ConfigState): Materialization {
  if (state.kind === "set") return state.config.materialization;
  return "view";
}

function uniqueKeyText(state: ConfigState): string {
  if (state.kind !== "set" || state.config.materialization !== "incremental") return "";
  return (state.config.uniqueKey ?? []).join(", ");
}

const options: readonly { readonly value: Materialization; readonly label: string }[] = [
  { value: "view", label: "view" },
  { value: "table", label: "table" },
  { value: "incremental", label: "incremental" },
];

/**
 * Edits the model's `{{ config(...) }}` call. Choosing a materialization rewrites the config
 * tag; incremental also exposes the unique key list the merge needs.
 */
export function MaterializationPicker({
  source,
  onChange,
  tableDisabled = false,
  className,
}: MaterializationPickerProps) {
  const state = readConfig(source);
  const blocked = state.kind === "unclosed";
  const materialization = materializationOf(state);
  const keysFromSource = uniqueKeyText(state);
  // Draft text while the field is focused, so a trailing comma survives mid-edit even though
  // the rewritten config call drops empty key slots.
  const [keyDraft, setKeyDraft] = useState<string | null>(null);
  const keyText = keyDraft ?? keysFromSource;

  const apply = (next: Materialization, typedKeys: string) => {
    if (blocked) return;
    if (next === "table" && tableDisabled) return;
    const uniqueKey = next === "incremental" ? (parseKeyList(typedKeys) ?? []) : null;
    const rewritten = writeConfig(source, { materialization: next, uniqueKey });
    if (rewritten !== null) onChange(rewritten);
  };

  return (
    <div
      className={cx("flex flex-wrap items-center gap-3", className)}
      role="group"
      aria-label="Materialization"
    >
      <label className="flex items-center gap-2 text-ash type-ui">
        <span className="text-smoke">Materialized</span>
        <select
          className={cx(
            "h-7 rounded-xs border border-line-control bg-inset px-2 text-parchment type-ui",
            "focus-visible:-outline-offset-2",
            "disabled:cursor-not-allowed disabled:text-smoke",
          )}
          value={materialization}
          disabled={blocked}
          aria-invalid={blocked || undefined}
          onChange={(event) => {
            apply(event.target.value as Materialization, keyText);
          }}
        >
          {options.map((option) => (
            <option
              key={option.value}
              value={option.value}
              disabled={option.value === "table" && tableDisabled}
            >
              {option.label}
              {option.value === "table" && tableDisabled ? " (unavailable)" : ""}
            </option>
          ))}
        </select>
      </label>
      {materialization === "incremental" ? (
        <label className="flex items-center gap-2 text-ash type-ui">
          <span className="text-smoke">unique_key</span>
          <input
            type="text"
            spellCheck={false}
            className={cx(
              "h-7 min-w-40 rounded-xs border border-line-control bg-inset px-2",
              "font-mono text-parchment type-code",
              "focus-visible:-outline-offset-2",
              "disabled:cursor-not-allowed disabled:text-smoke",
            )}
            value={keyText}
            disabled={blocked}
            placeholder="house_id, ts"
            aria-label="Unique key columns"
            onFocus={() => {
              setKeyDraft(keysFromSource);
            }}
            onChange={(event) => {
              setKeyDraft(event.target.value);
              apply("incremental", event.target.value);
            }}
            onBlur={() => {
              setKeyDraft(null);
            }}
          />
        </label>
      ) : null}
      {blocked ? (
        <p role="status" className="text-snuffed type-ui-s">
          Config tag is unclosed; close it before changing materialization.
        </p>
      ) : null}
    </div>
  );
}
