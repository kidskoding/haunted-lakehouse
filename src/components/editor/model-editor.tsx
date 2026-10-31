"use client";

import dynamic from "next/dynamic";
import { type KeyboardEvent, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { cx } from "@/components/ui/cx";
import { Shortcut, usePlatform } from "@/components/ui/kbd";
import { Panel, PanelActions, PanelBody, PanelHeader, PanelTitle } from "@/components/ui/panel";
import { ariaKeyShortcuts } from "@/components/ui/shortcut";
import { Tab, TabList, TabMarker, Tabs } from "@/components/ui/tabs";
import { errorsForPath } from "./diagnostics";
import { formatSql } from "./format";
import { MaterializationPicker } from "./materialization-picker";
import type { EditorError, EditorFile, EditorRelation } from "./types";

const SqlView = dynamic(() => import("./sql-view").then((module) => module.SqlView), {
  ssr: false,
  loading: () => (
    <div
      role="status"
      className="flex h-full min-h-24 items-center justify-center bg-inset text-ash type-ui"
    >
      Warming the editor…
    </div>
  ),
});

export interface ModelEditorProps {
  readonly files: readonly EditorFile[];
  readonly activePath: string;
  readonly onActivePathChange: (path: string) => void;
  readonly onChange: (path: string, source: string) => void;
  readonly relations: readonly EditorRelation[];
  readonly errors?: readonly EditorError[];
  readonly tableDisabled?: boolean;
  readonly onPreview?: () => void;
  readonly onRunNight?: () => void;
  readonly className?: string;
}

function tabLabel(path: string): string {
  return path.replace(/\.sql$/i, "");
}

/**
 * The controlled model editor: per-file tabs, a materialization picker, a lazily loaded SQL
 * view with schema-aware completion, format-on-demand, and the Preview / Run the night
 * shortcuts. It holds no game logic.
 */
export function ModelEditor({
  files,
  activePath,
  onActivePathChange,
  onChange,
  relations,
  errors = [],
  tableDisabled = false,
  onPreview,
  onRunNight,
  className,
}: ModelEditorProps) {
  const platform = usePlatform();
  const active = files.find((file) => file.path === activePath) ?? files[0];
  const activeErrors = useMemo(
    () => (active ? errorsForPath(active.path, errors) : []),
    [active, errors],
  );

  if (!active) {
    return (
      <Panel className={className}>
        <PanelHeader>
          <PanelTitle>Models</PanelTitle>
        </PanelHeader>
        <PanelBody>
          <p className="text-ash type-ui">No model files yet.</p>
        </PanelBody>
      </Panel>
    );
  }

  const formatActive = () => {
    onChange(active.path, formatSql(active.source));
  };

  const handlePanelKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    // CodeMirror owns these chords while the caret is in the document; the panel only
    // covers focus on the tabs, picker, and toolbar.
    const target = event.target;
    if (target instanceof HTMLElement && target.closest(".cm-content")) return;
    const mod = event.metaKey || event.ctrlKey;
    if (!mod) return;
    if (event.key === "Enter" && event.shiftKey) {
      event.preventDefault();
      onRunNight?.();
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      onPreview?.();
      return;
    }
    if (event.key.toLowerCase() === "s") {
      event.preventDefault();
      formatActive();
    }
  };

  return (
    <Panel className={cx("min-h-0", className)} onKeyDown={handlePanelKeyDown}>
      <PanelHeader>
        <PanelTitle>Models</PanelTitle>
        <PanelActions className="gap-2 pr-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={formatActive}
            aria-keyshortcuts={ariaKeyShortcuts(["Mod", "s"], platform)}
          >
            Format
            <Shortcut keys={["Mod", "s"]} aria-hidden />
          </Button>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={onPreview}
            aria-keyshortcuts={ariaKeyShortcuts(["Mod", "Enter"], platform)}
          >
            Preview
            <Shortcut keys={["Mod", "Enter"]} aria-hidden />
          </Button>
          <Button
            type="button"
            variant="primary"
            size="sm"
            onClick={onRunNight}
            aria-keyshortcuts={ariaKeyShortcuts(["Mod", "Shift", "Enter"], platform)}
          >
            Run the night
            <Shortcut keys={["Mod", "Shift", "Enter"]} aria-hidden />
          </Button>
        </PanelActions>
      </PanelHeader>
      <div className="flex min-h-0 flex-1 flex-col">
        <Tabs value={active.path} onValueChange={onActivePathChange}>
          <TabList aria-label="Model files" className="px-2">
            {files.map((file) => {
              const fileErrors = errorsForPath(file.path, errors);
              return (
                <Tab key={file.path} value={file.path}>
                  {tabLabel(file.path)}
                  {fileErrors.length > 0 ? (
                    <TabMarker tone="error" label="has an error" />
                  ) : file.unsaved ? (
                    <TabMarker tone="unsaved" label="unsaved changes" />
                  ) : null}
                </Tab>
              );
            })}
          </TabList>
        </Tabs>
        <div className="flex shrink-0 items-center border-b border-line-faint px-3 py-2">
          <MaterializationPicker
            source={active.source}
            tableDisabled={tableDisabled}
            onChange={(next) => {
              onChange(active.path, next);
            }}
          />
        </div>
        <SqlView
          path={active.path}
          source={active.source}
          relations={relations}
          errors={activeErrors}
          onChange={(next) => {
            onChange(active.path, next);
          }}
          {...(onPreview ? { onPreview } : {})}
          {...(onRunNight ? { onRunNight } : {})}
          onFormat={formatActive}
          className="min-h-24 flex-1 overflow-hidden"
        />
      </div>
    </Panel>
  );
}
