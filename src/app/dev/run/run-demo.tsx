"use client";

import { useCallback, useState, type ReactNode } from "react";
import { PipelineDag } from "@/components/dag/pipeline-dag";
import { ModelEditor, type EditorFile, type EditorRelation } from "@/components/editor";
import { ResultsPanel } from "@/components/results";
import { RunLayout } from "@/components/run";
import { Panel, PanelBody, PanelEmpty, PanelHeader, PanelTitle } from "@/components/ui/panel";
import { scenarios } from "../dag/fixtures";
import { porchLights } from "../results/fixtures";

const porch = scenarios.find((entry) => entry.id === "porch");

const RELATIONS: readonly EditorRelation[] = [
  { id: "bronze.porch_events", columns: ["house_id", "event_ts", "state"] },
  { id: "silver.latest", columns: ["house_id", "state", "as_of"] },
  { id: "gold.lit_at_checkpoint", columns: ["house_id", "lit"] },
];

const INITIAL_FILES: readonly EditorFile[] = [
  {
    path: "silver/latest.sql",
    source:
      "{{ config(materialized='incremental', unique_key='house_id') }}\n" +
      "select\n" +
      "  house_id,\n" +
      "  state,\n" +
      "  event_ts as as_of\n" +
      "from {{ new_batch('porch_events') }}\n",
  },
  {
    path: "gold/lit_at_checkpoint.sql",
    source: "select house_id, state = 'on' as lit\nfrom silver.latest\n",
  },
];

/** `silver.latest` lives at `silver/latest.sql`. */
function pathOf(modelId: string): string {
  return `${modelId.replace(".", "/")}.sql`;
}

/** A bar slot that a later item fills: a dashed frame naming what lands in it. */
function BarSlot({
  className,
  children,
}: {
  readonly className: string;
  readonly children: ReactNode;
}) {
  return (
    <div className={`flex items-center px-4 ${className}`}>
      <p className="flex h-full w-full items-center rounded-xs border border-dashed border-line-strong px-4 text-smoke type-ui">
        {children}
      </p>
    </div>
  );
}

function EmptyPanel({ title, children }: { readonly title: string; readonly children: ReactNode }) {
  return (
    <Panel>
      <PanelHeader>
        <PanelTitle>{title}</PanelTitle>
      </PanelHeader>
      <PanelBody className="flex items-center">
        <PanelEmpty>{children}</PanelEmpty>
      </PanelBody>
    </Panel>
  );
}

/**
 * The run-screen layout with fixtures in its slots: the porch-lights DAG, editor, and
 * results, and empty frames for the story, table browser, and both bars.
 */
export function RunDemo() {
  const [files, setFiles] = useState<EditorFile[]>(() => [...INITIAL_FILES]);
  const [activePath, setActivePath] = useState(INITIAL_FILES[0]?.path ?? "");

  const onChange = useCallback((path: string, source: string) => {
    setFiles((prev) =>
      prev.map((file) => (file.path === path ? { ...file, source, unsaved: true } : file)),
    );
  }, []);

  return (
    <RunLayout
      title="Porch Lights, 6:00pm"
      topBar={<BarSlot className="h-14 py-2">Candles, the night clock, and the seed</BarSlot>}
      story={
        <EmptyPanel title="Story">
          The hour&rsquo;s story lands here, told by whoever needs the numbers tonight.
        </EmptyPanel>
      }
      tables={
        <EmptyPanel title="Tables">
          Bronze feeds, their schemas, and the batches seen so far are listed here.
        </EmptyPanel>
      }
      dag={
        <PipelineDag
          models={porch?.models ?? []}
          feeds={porch?.feeds ?? []}
          openModelId={activePath.replace(/\.sql$/, "").replace("/", ".")}
          onOpenModel={(id) => {
            setActivePath(pathOf(id));
          }}
        />
      }
      editor={
        <ModelEditor
          files={files}
          activePath={activePath}
          onActivePathChange={setActivePath}
          onChange={onChange}
          relations={RELATIONS}
        />
      }
      results={
        <ResultsPanel
          view={{ status: "ready", result: porchLights, label: "gold.lit_at_checkpoint" }}
        />
      }
      bottomBar={<BarSlot className="h-16 py-3">Relics, Preview, and Run the night</BarSlot>}
    />
  );
}
