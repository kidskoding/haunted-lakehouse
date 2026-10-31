"use client";

import { useId, useMemo, useRef, useState, type KeyboardEvent } from "react";
import type { CompileError } from "../../lib/pipeline/types";
import {
  edgePath,
  layoutDag,
  lineage,
  LABEL_TOP,
  NODE_HEIGHT,
  NODE_WIDTH,
  type DagLayer,
  type DagModel,
  type DagNode,
} from "./layout";
import { useGlide, useReducedMotion, type Point } from "./motion";

export interface PipelineDagProps {
  /**
   * The models to draw. Pass a compiled pipeline's models; while the project does not
   * compile, pass the last models that did, plus any model only the errors name.
   */
  readonly models: readonly DagModel[];
  /** Compile errors. Each marks its model; errors without a model show above the graph. */
  readonly errors?: readonly CompileError[];
  /** The hour's bronze feeds, drawn even before a model reads them. */
  readonly feeds?: readonly string[];
  /** The model whose editor tab is open. */
  readonly openModelId?: string | null;
  readonly onOpenModel: (id: string) => void;
  readonly className?: string;
}

type NodeState = "active" | "inactive" | "error" | "checked";

const LAYER_NAMES: Record<DagLayer, string> = { bronze: "Bronze", silver: "Silver", gold: "Gold" };

function plural(count: number, noun: string): string {
  return `${String(count)} ${noun}${count === 1 ? "" : "s"}`;
}

function stateOf(model: DagModel, errorCount: number, layer: DagLayer): NodeState {
  if (errorCount > 0) return "error";
  if (!model.active) return "inactive";
  return layer === "gold" ? "checked" : "active";
}

const STATE_WORDS: Record<NodeState, string> = {
  active: "active",
  inactive: "inactive",
  error: "error",
  checked: "checked",
};

/**
 * The pipeline as a live graph: bronze feeds, silver and gold models, left to right. Clicking
 * a model, or pressing Enter on it, opens its editor tab. Arrow keys walk the models in DAG
 * order; hovering or focusing one lights its upstream and downstream.
 */
export function PipelineDag({
  models,
  errors = [],
  feeds = [],
  openModelId = null,
  onOpenModel,
  className,
}: PipelineDagProps) {
  const headingId = useId();
  const reduced = useReducedMotion();

  const errorsByModel = useMemo(() => {
    const grouped = new Map<string, CompileError[]>();
    for (const error of errors) {
      if (error.model === null) continue;
      grouped.set(error.model, [...(grouped.get(error.model) ?? []), error]);
    }
    return grouped;
  }, [errors]);

  const allModels = useMemo(() => {
    const known = new Set(models.map((model) => model.id));
    const orphans = [...errorsByModel.keys()]
      .filter((id) => !known.has(id))
      .map((id): DagModel => ({ id, materialization: null, refs: [], active: false }));
    return [...models, ...orphans];
  }, [models, errorsByModel]);

  const layout = useMemo(() => layoutDag(allModels, feeds), [allModels, feeds]);
  const modelsById = useMemo(() => new Map(allModels.map((m) => [m.id, m])), [allModels]);
  const tonight = useMemo(() => new Set(feeds.map((feed) => `bronze.${feed}`)), [feeds]);
  const targets = useMemo(
    () => new Map<string, Point>(layout.nodes.map((node) => [node.id, node])),
    [layout],
  );
  const shown = useGlide(targets, reduced);

  const [hot, setHot] = useState<string | null>(null);
  const [focusId, setFocusId] = useState<string | null>(null);
  const buttons = useRef(new Map<string, HTMLButtonElement>());

  const lit = useMemo(() => {
    if (hot === null || !targets.has(hot)) return null;
    const { upstream, downstream } = lineage(layout.edges, hot);
    return { upstream, downstream };
  }, [hot, layout, targets]);

  const tabStop =
    [focusId, openModelId].find((id) => id !== null && layout.order.includes(id)) ??
    layout.order[0];

  const moveFocus = (event: KeyboardEvent, id: string) => {
    const index = layout.order.indexOf(id);
    const last = layout.order.length - 1;
    const target = {
      ArrowDown: index + 1,
      ArrowRight: index + 1,
      ArrowUp: index - 1,
      ArrowLeft: index - 1,
      Home: 0,
      End: last,
    }[event.key];
    if (target === undefined) return;
    event.preventDefault();
    const next = layout.order[Math.min(last, Math.max(0, target))];
    if (next !== undefined) buttons.current.get(next)?.focus();
  };

  const modelCount = layout.order.length;
  const goldCount = layout.order.filter((id) => id.startsWith("gold.")).length;
  const inactiveCount = allModels.filter(
    (model) => !model.active && !errorsByModel.has(model.id),
  ).length;
  const projectErrors = errors.filter((error) => error.model === null);
  const brokenModels = [...errorsByModel.keys()].sort();
  const summary =
    modelCount === 0
      ? "No models yet"
      : [
          plural(modelCount, "model"),
          goldCount > 0 ? `${String(goldCount)} gold` : null,
          inactiveCount > 0 ? `${String(inactiveCount)} inactive` : null,
        ]
          .filter((part) => part !== null)
          .join(" · ");

  const describe = (node: DagNode): string => {
    const reads = layout.edges.filter((e) => e.to === node.id).map((e) => e.from);
    const readBy = layout.edges.filter((e) => e.from === node.id).map((e) => e.to);
    const model = modelsById.get(node.id);
    const parts = [
      node.id,
      model?.materialization ?? null,
      model
        ? STATE_WORDS[stateOf(model, errorsByModel.get(node.id)?.length ?? 0, node.layer)]
        : null,
    ].filter((part) => part !== null);
    const sentences = [parts.join(", ")];
    if (reads.length > 0) sentences.push(`Reads ${reads.join(", ")}`);
    if (readBy.length > 0) sentences.push(`Read by ${readBy.join(", ")}`);
    for (const error of errorsByModel.get(node.id) ?? []) sentences.push(error.message);
    return `${sentences.join(". ")}.`;
  };

  const dimmed = (id: string) =>
    lit !== null && id !== hot && !lit.upstream.has(id) && !lit.downstream.has(id);

  const edgeTone = (from: string, to: string): "lit" | "dim" | "rest" => {
    if (lit === null || hot === null) return "rest";
    const up = (id: string) => id === hot || lit.upstream.has(id);
    const down = (id: string) => id === hot || lit.downstream.has(id);
    return (up(from) && up(to)) || (down(from) && down(to)) ? "lit" : "dim";
  };

  return (
    <section
      aria-labelledby={headingId}
      className={`flex min-h-0 flex-col bg-panel ${className ?? ""}`}
      data-testid="pipeline-dag"
    >
      <header className="flex items-baseline justify-between gap-4 px-4 pt-3 pb-2">
        <h2 id={headingId} className="type-ui-l text-parchment">
          Pipeline
        </h2>
        <p className="type-ui-s text-ash">
          {summary}
          {layout.missingGold ? <span className="text-tallow"> · no gold model</span> : null}
        </p>
      </header>

      <ErrorStrip
        cycle={layout.cycle}
        brokenModels={brokenModels}
        errorsByModel={errorsByModel}
        projectErrors={projectErrors}
        onOpenModel={onOpenModel}
      />

      <div className="relative min-h-0 flex-1 overflow-auto">
        <div
          className="relative"
          style={{ width: layout.width, height: layout.height, minWidth: "100%" }}
          onPointerLeave={() => {
            setHot(null);
          }}
        >
          {layout.columns.map((column) => (
            <p
              key={column.layer}
              aria-hidden="true"
              className="type-ui-s absolute font-semibold text-smoke"
              style={{ left: column.x, top: LABEL_TOP }}
            >
              {LAYER_NAMES[column.layer]}
            </p>
          ))}

          <svg
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 overflow-visible"
            width={layout.width}
            height={layout.height}
          >
            <defs>
              {(["rest", "lit", "dim", "loop"] as const).map((tone) => (
                <marker
                  key={tone}
                  id={`${headingId}-arrow-${tone}`}
                  viewBox="0 0 8 8"
                  refX="7"
                  refY="4"
                  markerWidth="8"
                  markerHeight="8"
                  orient="auto"
                >
                  <path d="M1 1L7 4L1 7" className={`fill-none ${ARROW_CLASS[tone]}`} />
                </marker>
              ))}
            </defs>
            {layout.edges.map((edge) => {
              const from = shown.get(edge.from);
              const to = shown.get(edge.to);
              if (!from || !to) return null;
              const tone = edgeTone(edge.from, edge.to);
              const look = edge.loop && tone !== "dim" ? "loop" : tone;
              return (
                <path
                  key={`${edge.from}>${edge.to}`}
                  d={edgePath(from, to, edge.loop)}
                  markerEnd={`url(#${headingId}-arrow-${look})`}
                  data-edge={`${edge.from}>${edge.to}`}
                  data-tone={tone}
                  className={`fill-none transition-[stroke,opacity] duration-fast ${EDGE_CLASS[look]}`}
                />
              );
            })}
          </svg>

          <ul aria-label="Pipeline nodes, in DAG order" className="contents">
            {[...layout.nodes]
              .sort((a, b) => Number(a.kind === "model") - Number(b.kind === "model"))
              .sort(
                (a, b) =>
                  (a.kind === "model" ? layout.order.indexOf(a.id) : -1) -
                  (b.kind === "model" ? layout.order.indexOf(b.id) : -1),
              )
              .map((node) => {
                const at = shown.get(node.id) ?? node;
                const style = { transform: `translate(${String(at.x)}px, ${String(at.y)}px)` };
                const faded = dimmed(node.id);
                const shell = `absolute top-0 left-0 transition-opacity duration-base starting:opacity-0 ${faded ? "opacity-40" : "opacity-100"}`;
                if (node.kind === "model") {
                  const model = modelsById.get(node.id);
                  if (!model) return null;
                  return (
                    <li key={node.id} className={shell} style={style}>
                      <ModelNode
                        node={node}
                        model={model}
                        errorCount={errorsByModel.get(node.id)?.length ?? 0}
                        open={node.id === openModelId}
                        tabIndex={node.id === tabStop ? 0 : -1}
                        label={describe(node)}
                        lit={hot === node.id}
                        buttonRef={(element) => {
                          if (element) buttons.current.set(node.id, element);
                          else buttons.current.delete(node.id);
                        }}
                        onOpen={() => {
                          onOpenModel(node.id);
                        }}
                        onKeyDown={(event) => {
                          moveFocus(event, node.id);
                        }}
                        onFocus={() => {
                          setFocusId(node.id);
                          setHot(node.id);
                        }}
                        onBlur={() => {
                          setHot(null);
                        }}
                        onPointerEnter={() => {
                          setHot(node.id);
                        }}
                      />
                    </li>
                  );
                }
                return (
                  <li
                    key={node.id}
                    className={shell}
                    style={style}
                    onPointerEnter={() => {
                      setHot(node.kind === "feed" ? node.id : null);
                    }}
                  >
                    {node.kind === "feed" ? (
                      <FeedNode
                        node={node}
                        resting={feeds.length > 0 && !tonight.has(node.id)}
                        label={describe(node)}
                      />
                    ) : (
                      <PlaceholderNode layer={node.layer} />
                    )}
                  </li>
                );
              })}
          </ul>
        </div>
      </div>
    </section>
  );
}

const EDGE_CLASS = {
  rest: "stroke-line-control stroke-[1.5]",
  lit: "stroke-ash stroke-2",
  dim: "stroke-line-faint stroke-[1.5] opacity-60",
  loop: "stroke-snuffed stroke-2 [stroke-dasharray:6_4]",
} as const;

const ARROW_CLASS = {
  rest: "stroke-line-control stroke-[1.25]",
  lit: "stroke-ash stroke-[1.25]",
  dim: "stroke-line-faint stroke-[1.25]",
  loop: "stroke-snuffed stroke-[1.25]",
} as const;

const BOX = "flex flex-col justify-center gap-0.5 rounded-xs px-3 text-left";
const SIZE = { width: NODE_WIDTH, height: NODE_HEIGHT };

const STATE_STYLE: Record<NodeState, { box: string; word: string }> = {
  active: { box: "border border-line-control bg-raised", word: "text-ash" },
  inactive: { box: "border border-dashed border-line-strong bg-panel", word: "text-smoke" },
  error: { box: "border border-snuffed bg-tint-snuffed", word: "text-snuffed" },
  checked: { box: "border border-ember bg-raised", word: "text-flame" },
};

interface ModelNodeProps {
  readonly node: DagNode;
  readonly model: DagModel;
  readonly errorCount: number;
  readonly open: boolean;
  readonly lit: boolean;
  readonly tabIndex: number;
  readonly label: string;
  readonly buttonRef: (element: HTMLButtonElement | null) => void;
  readonly onOpen: () => void;
  readonly onKeyDown: (event: KeyboardEvent<HTMLButtonElement>) => void;
  readonly onFocus: () => void;
  readonly onBlur: () => void;
  readonly onPointerEnter: () => void;
}

function ModelNode({
  node,
  model,
  errorCount,
  open,
  lit,
  tabIndex,
  label,
  buttonRef,
  onOpen,
  onKeyDown,
  onFocus,
  onBlur,
  onPointerEnter,
}: ModelNodeProps) {
  const state = stateOf(model, errorCount, node.layer);
  const look = STATE_STYLE[state];
  const word = state === "error" ? plural(errorCount, "error") : STATE_WORDS[state];
  return (
    <button
      ref={buttonRef}
      type="button"
      tabIndex={tabIndex}
      aria-label={label}
      aria-current={open ? "page" : undefined}
      data-node={node.id}
      data-state={state}
      title={node.id}
      onClick={onOpen}
      onKeyDown={onKeyDown}
      onFocus={onFocus}
      onBlur={onBlur}
      onPointerEnter={onPointerEnter}
      className={`${BOX} ${look.box} cursor-pointer transition-colors duration-fast focus-visible:-outline-offset-2 hover:bg-fog ${open ? "bg-fog" : ""} ${lit ? "border-ash" : ""}`}
      style={SIZE}
    >
      <span
        className={`type-data block truncate ${state === "inactive" ? "text-ash" : "text-parchment"}`}
      >
        {node.name}
      </span>
      <span className="type-ui-s flex gap-1.5 text-smoke">
        <span>{model.materialization ?? "—"}</span>
        <span aria-hidden="true">·</span>
        <span className={look.word}>{word}</span>
        {open ? <span className="ml-auto text-ash">open</span> : null}
      </span>
    </button>
  );
}

function FeedNode({
  node,
  resting,
  label,
}: {
  readonly node: DagNode;
  readonly resting: boolean;
  readonly label: string;
}) {
  return (
    <div
      role="img"
      aria-label={`${label}${resting ? " Not a feed of this hour." : ""}`}
      data-node={node.id}
      data-state={resting ? "resting" : "feed"}
      title={node.id}
      className={`${BOX} border border-line-faint bg-inset`}
      style={SIZE}
    >
      <span className={`type-data block truncate ${resting ? "text-smoke" : "text-moon"}`}>
        {node.name}
      </span>
      <span className="type-ui-s text-smoke">{resting ? "not this hour" : "bronze feed"}</span>
    </div>
  );
}

function PlaceholderNode({ layer }: { readonly layer: DagLayer }) {
  const gold = layer === "gold";
  return (
    <div
      data-node={`${layer}.*`}
      data-state="placeholder"
      className={`${BOX} border border-dashed ${gold ? "border-tallow/60" : "border-line-strong"}`}
      style={SIZE}
    >
      <span className={`type-ui font-semibold ${gold ? "text-tallow" : "text-ash"}`}>
        {gold ? "Needs a gold model" : "No models yet"}
      </span>
      <span className="type-data-s text-smoke">{layer}/&lt;name&gt;.sql</span>
    </div>
  );
}

interface ErrorStripProps {
  readonly cycle: readonly string[] | null;
  readonly brokenModels: readonly string[];
  readonly errorsByModel: ReadonlyMap<string, readonly CompileError[]>;
  readonly projectErrors: readonly CompileError[];
  readonly onOpenModel: (id: string) => void;
}

function ErrorStrip({
  cycle,
  brokenModels,
  errorsByModel,
  projectErrors,
  onOpenModel,
}: ErrorStripProps) {
  if (cycle === null && brokenModels.length === 0 && projectErrors.length === 0) return null;
  const count = brokenModels.length + (projectErrors.length > 0 ? 1 : 0);
  return (
    <div
      role="status"
      className="mx-4 mb-2 max-h-40 overflow-y-auto rounded-xs bg-tint-snuffed px-3 py-2"
    >
      <p className="type-ui font-semibold text-parchment">
        {cycle !== null
          ? "The pipeline reads itself in a loop"
          : `${count === 1 ? "The project" : `${String(count)} parts of the project`} won't compile`}
      </p>
      {cycle !== null ? (
        <p className="type-data mt-1 flex flex-wrap items-center gap-x-1.5 text-ash">
          {cycle.map((id, index) => (
            <span key={`${id}-${String(index)}`} className="flex items-center gap-1.5">
              {index > 0 ? <span aria-label="reads">→</span> : null}
              <ErrorLink id={id} onOpenModel={onOpenModel} />
            </span>
          ))}
        </p>
      ) : null}
      <ul className="mt-1 space-y-0.5">
        {brokenModels.map((id) => (
          <li key={id} className="type-ui-s flex gap-2 text-ash">
            <ErrorLink id={id} onOpenModel={onOpenModel} />
            <span className="min-w-0">{errorsByModel.get(id)?.[0]?.message}</span>
          </li>
        ))}
        {projectErrors.map((error) => (
          <li key={error.message} className="type-ui-s text-ash">
            {error.message}
          </li>
        ))}
      </ul>
    </div>
  );
}

function ErrorLink({
  id,
  onOpenModel,
}: {
  readonly id: string;
  readonly onOpenModel: (id: string) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => {
        onOpenModel(id);
      }}
      className="type-data shrink-0 cursor-pointer text-parchment underline decoration-snuffed underline-offset-2 hover:text-glow"
    >
      {id}
    </button>
  );
}
