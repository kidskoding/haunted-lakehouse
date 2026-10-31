"use client";

import { useCallback, useState } from "react";
import {
  ModelEditor,
  type EditorError,
  type EditorFile,
  type EditorRelation,
} from "@/components/editor";
import { cx } from "@/components/ui/cx";

const RELATIONS: readonly EditorRelation[] = [
  {
    id: "bronze.porch_events",
    columns: ["house_id", "event_ts", "state"],
  },
  {
    id: "bronze.candy_weights",
    columns: ["candy_type", "grams"],
  },
  {
    id: "silver.porch_state",
    columns: ["house_id", "state", "as_of"],
  },
  {
    id: "gold.welcoming_houses",
    columns: ["house_id", "lit"],
  },
];

const INITIAL_FILES: readonly EditorFile[] = [
  {
    path: "silver/porch_state.sql",
    source:
      "{{ config(materialized='incremental', unique_key='house_id') }}\n" +
      "select\n" +
      "  house_id,\n" +
      "  state,\n" +
      "  event_ts as as_of\n" +
      "from {{ new_batch('porch_events') }}\n",
    unsaved: false,
  },
  {
    path: "gold/welcoming_houses.sql",
    source: "select house_id, state = 'on' as lit\nfrom silver.porch_state\nwhere state = 'on'\n",
    unsaved: true,
  },
  {
    path: "gold/broken_count.sql",
    source: "select count(*) as n form bronze.porch_events\n",
    unsaved: false,
  },
];

const SAMPLE_ERRORS: readonly EditorError[] = [
  {
    path: "gold/broken_count.sql",
    message: 'syntax error at or near "form"',
    line: 1,
    column: 24,
  },
];

/**
 * Interactive specimen for `/dev/editor`: sample porch-light models, a deliberate syntax
 * error, and a live log of Preview / Run the night shortcuts.
 */
export function EditorDemo() {
  const [files, setFiles] = useState<EditorFile[]>(() => [...INITIAL_FILES]);
  const [activePath, setActivePath] = useState(INITIAL_FILES[0]?.path ?? "");
  const [tableDisabled, setTableDisabled] = useState(false);
  const [log, setLog] = useState<string[]>([]);

  const pushLog = useCallback((line: string) => {
    setLog((prev) => [line, ...prev].slice(0, 6));
  }, []);

  const onChange = useCallback((path: string, source: string) => {
    setFiles((prev) =>
      prev.map((file) => (file.path === path ? { ...file, source, unsaved: true } : file)),
    );
  }, []);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center gap-4">
        <label className="flex items-center gap-2 text-ash type-ui">
          <input
            type="checkbox"
            checked={tableDisabled}
            onChange={(event) => {
              setTableDisabled(event.target.checked);
            }}
            className="size-4 rounded-xs border border-line-control accent-flame"
          />
          Purist mode (table disabled)
        </label>
      </div>
      <ModelEditor
        files={files}
        activePath={activePath}
        onActivePathChange={setActivePath}
        onChange={onChange}
        relations={RELATIONS}
        errors={SAMPLE_ERRORS}
        tableDisabled={tableDisabled}
        onPreview={() => {
          pushLog("Preview");
        }}
        onRunNight={() => {
          pushLog("Run the night");
        }}
        className="h-[32rem] overflow-hidden rounded-s"
      />
      <section aria-labelledby="shortcut-log-title" className="rounded-s bg-panel p-4">
        <h2 id="shortcut-log-title" className="text-parchment type-ui-l">
          Shortcut log
        </h2>
        <p className="mt-1 text-ash type-ui">
          Preview and Run the night land here so the shortcuts can be checked without a run.
        </p>
        <ol className="mt-3 flex flex-col gap-1 font-mono type-code">
          {log.length === 0 ? (
            <li className="text-smoke">No shortcuts yet.</li>
          ) : (
            log.map((line, index) => (
              <li key={`${line}-${String(index)}`} className={cx("text-parchment")}>
                {line}
              </li>
            ))
          )}
        </ol>
      </section>
    </div>
  );
}
