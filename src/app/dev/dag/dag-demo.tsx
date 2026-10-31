"use client";

import { useState } from "react";
import { PipelineDag } from "@/components/dag/pipeline-dag";
import { cx } from "@/components/ui/cx";
import { scenarios } from "./fixtures";

/**
 * Development harness for the pipeline DAG. Scenario fixtures stand in for `compile()`
 * output; clicking a model only records which editor tab would open (5.3.6 wires the real one).
 */
export function DagDemo() {
  const initial = scenarios.find((entry) => entry.id === "porch") ?? scenarios[0];
  const [scenarioId, setScenarioId] = useState(initial?.id ?? "porch");
  const [openModelId, setOpenModelId] = useState<string | null>(null);
  const [openedLog, setOpenedLog] = useState<readonly string[]>([]);
  const scenario = scenarios.find((entry) => entry.id === scenarioId) ?? initial ?? scenarios[0];
  if (scenario === undefined) {
    throw new Error("DAG demo fixtures are empty");
  }

  const openModel = (id: string) => {
    setOpenModelId(id);
    setOpenedLog((log) => [...log, id].slice(-8));
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-6">
      <div className="flex flex-wrap gap-2" role="tablist" aria-label="DAG scenarios">
        {scenarios.map((entry) => {
          const selected = entry.id === scenario.id;
          return (
            <button
              key={entry.id}
              type="button"
              role="tab"
              aria-selected={selected}
              onClick={() => {
                setScenarioId(entry.id);
                setOpenModelId(null);
              }}
              className={cx(
                "h-8 cursor-pointer rounded-xs px-3 type-ui font-semibold transition-colors duration-fast",
                selected
                  ? "bg-raised text-parchment"
                  : "bg-panel text-ash hover:bg-raised hover:text-parchment",
              )}
            >
              {entry.title}
            </button>
          );
        })}
      </div>

      <p className="max-w-reading text-pretty text-ash type-prose-s">{scenario.blurb}</p>

      <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-[minmax(0,1fr)_16rem]">
        <div className="min-h-[28rem] overflow-hidden rounded-xs border border-line-faint">
          <PipelineDag
            key={scenario.id}
            models={scenario.models}
            errors={scenario.errors}
            feeds={scenario.feeds}
            openModelId={openModelId}
            onOpenModel={openModel}
            className="h-full min-h-[28rem]"
          />
        </div>

        <aside
          aria-label="Editor stub"
          className="flex flex-col gap-3 rounded-xs border border-line-faint bg-panel p-4"
        >
          <h2 className="type-ui-l text-parchment">Editor tab</h2>
          <p className="text-pretty text-ash type-ui-s">
            {openModelId === null
              ? "Click a model, or focus one and press Enter. The run screen will open that file in the editor."
              : `Would open ${openModelId}.`}
          </p>
          {openedLog.length > 0 ? (
            <ol className="mt-auto space-y-1 border-t border-line-faint pt-3">
              {[...openedLog].reverse().map((id, index) => (
                <li key={`${id}-${String(index)}`} className="type-data-s text-smoke">
                  {id}
                </li>
              ))}
            </ol>
          ) : null}
        </aside>
      </div>
    </div>
  );
}
