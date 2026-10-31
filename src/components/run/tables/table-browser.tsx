"use client";

import { useId, useRef, useState, type KeyboardEvent } from "react";
import { formatCount } from "@/components/results/format";
import { Button } from "@/components/ui/button";
import { cx } from "@/components/ui/cx";
import { ChevronIcon } from "@/components/ui/icons";
import { PanelEmpty, PanelError, PanelSkeleton } from "@/components/ui/panel";
import { batchRanges, LAYERS, type CatalogRelation, type Layer } from "./catalog";
import { treeAction, type TreeRow } from "./tree-keys";
import type { TablesView } from "./use-table-catalog";

/** The hour's bronze retention (runtime contract 4.3), for the "keeps the last N" note. */
export interface Retention {
  /** How many delivered batches each feed keeps. */
  readonly keeps: number;
  /** How many batches have been delivered so far in this execution. */
  readonly delivered: number;
}

export interface TableBrowserProps {
  readonly view: TablesView;
  readonly retention?: Retention;
  /** Called when the player clicks a column, or presses Enter or Space on it. */
  readonly onPick?: (column: string, relation: CatalogRelation) => void;
  readonly className?: string;
}

const LAYER_TITLES: Record<Layer, string> = {
  bronze: "Bronze feeds",
  silver: "Silver",
  gold: "Gold",
};

function plural(count: number, one: string, many: string): string {
  return `${formatCount(count)} ${count === 1 ? one : many}`;
}

/**
 * The run screen's table browser: every bronze feed with its columns and types, row count,
 * and the batches retention still holds, then the player's silver and gold relations. Each
 * layer is an APG tree; picking a column hands its name to `onPick` for the editor.
 */
export function TableBrowser({ view, retention, onPick, className }: TableBrowserProps) {
  const hintId = useId();
  if (view.status === "loading") {
    return (
      <div className={cx("p-4", className)}>
        <PanelSkeleton label="Reading the tables" lines={[0.7, 0.45, 0.82, 0.52, 0.64]} />
      </div>
    );
  }
  if (view.status === "error") {
    return (
      <div className={cx("p-4", className)}>
        <PanelError message={`The tables couldn't be read: ${view.message}`}>
          {view.onRetry ? (
            <Button size="sm" variant="ghost" onClick={view.onRetry}>
              Retry
            </Button>
          ) : null}
        </PanelError>
      </div>
    );
  }
  if (view.relations.length === 0) {
    return (
      <div className={cx("flex items-center px-4", className)}>
        <PanelEmpty>Nothing has landed yet. Bronze fills when the first batch arrives.</PanelEmpty>
      </div>
    );
  }

  const retired = retention ? Math.max(0, retention.delivered - retention.keeps) : 0;
  return (
    <div className={cx("flex flex-col gap-5 py-3", className)}>
      {onPick ? (
        <p id={hintId} hidden>
          Press Enter on a column to insert its name in the editor.
        </p>
      ) : null}
      {LAYERS.map((layer) => {
        const relations = view.relations.filter((relation) => relation.layer === layer);
        if (relations.length === 0) return null;
        return (
          <LayerTree
            key={layer}
            layer={layer}
            relations={relations}
            retired={retired}
            {...(layer === "bronze" && retention ? { keeps: retention.keeps } : {})}
            {...(onPick ? { onPick, hintId } : {})}
          />
        );
      })}
    </div>
  );
}

interface LayerTreeProps {
  readonly layer: Layer;
  readonly relations: readonly CatalogRelation[];
  readonly retired: number;
  readonly keeps?: number;
  readonly onPick?: (column: string, relation: CatalogRelation) => void;
  readonly hintId?: string;
}

interface Row extends TreeRow {
  readonly relation: CatalogRelation;
  readonly column?: { readonly name: string; readonly type: string };
}

function LayerTree({ layer, relations, retired, keeps, onPick, hintId }: LayerTreeProps) {
  const headingId = useId();
  const [opened, setOpened] = useState<ReadonlyMap<string, boolean>>(new Map());
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const items = useRef(new Map<string, HTMLLIElement>());

  // Bronze starts open: its schema is what the player reads first.
  const isOpen = (relation: CatalogRelation) => opened.get(relation.id) ?? layer === "bronze";
  const rows: Row[] = relations.flatMap((relation) => {
    const expanded = isOpen(relation);
    const head: Row = {
      key: relation.id,
      parent: null,
      expandable: relation.columns.length > 0,
      expanded,
      relation,
    };
    if (!expanded) return [head];
    return [
      head,
      ...relation.columns.map((column) => ({
        key: `${relation.id}\n${column.name}`,
        parent: relation.id,
        expandable: false,
        expanded: false,
        relation,
        column,
      })),
    ];
  });
  const active = rows.some((row) => row.key === activeKey) ? activeKey : (rows[0]?.key ?? null);

  function toggle(relation: CatalogRelation, expanded: boolean) {
    setOpened((previous) => new Map(previous).set(relation.id, expanded));
  }

  function activate(row: Row) {
    if (row.column) onPick?.(row.column.name, row.relation);
    else if (row.expandable) toggle(row.relation, !row.expanded);
  }

  function focusRow(key: string) {
    setActiveKey(key);
    items.current.get(key)?.focus();
  }

  function onKeyDown(event: KeyboardEvent<HTMLUListElement>) {
    if (active === null) return;
    const action = treeAction(rows, active, event.key);
    if (action === undefined) return;
    event.preventDefault();
    const row = rows.find((candidate) => candidate.key === action.key);
    if (row === undefined) return;
    if (action.type === "focus") focusRow(action.key);
    else if (action.type === "expand") toggle(row.relation, action.expanded);
    else activate(row);
  }

  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-1">
      <div className="flex items-baseline justify-between gap-3 px-4">
        <h3 id={headingId} className="text-ash type-ui-s">
          {LAYER_TITLES[layer]}
        </h3>
        {keeps !== undefined ? (
          <p className="text-smoke type-ui-s">Keeps the last {plural(keeps, "batch", "batches")}</p>
        ) : null}
      </div>
      <ul
        role="tree"
        aria-labelledby={headingId}
        aria-describedby={hintId}
        onKeyDown={onKeyDown}
        className="flex flex-col"
      >
        {rows.map((row) => {
          const ref = (element: HTMLLIElement | null) => {
            if (element) items.current.set(row.key, element);
            else items.current.delete(row.key);
          };
          const common = {
            ref,
            tabIndex: row.key === active ? 0 : -1,
            selected: row.key === active,
            onFocus: () => {
              setActiveKey(row.key);
            },
            onClick: () => {
              setActiveKey(row.key);
              activate(row);
            },
          } as const;
          return row.column ? (
            <ColumnItem
              key={row.key}
              {...common}
              column={row.column}
              pickable={onPick !== undefined}
              position={row.relation.columns.indexOf(row.column) + 1}
              size={row.relation.columns.length}
            />
          ) : (
            <RelationItem
              key={row.key}
              {...common}
              relation={row.relation}
              expanded={row.expandable ? row.expanded : undefined}
              position={relations.indexOf(row.relation) + 1}
              size={relations.length}
              retired={retired}
            />
          );
        })}
      </ul>
    </section>
  );
}

interface ItemProps {
  readonly ref: (element: HTMLLIElement | null) => void;
  readonly tabIndex: number;
  /** Selection follows focus: the active row is the selected one. */
  readonly selected: boolean;
  readonly onFocus: () => void;
  readonly onClick: () => void;
  readonly position: number;
  readonly size: number;
}

// The tree is flat, with levels in aria-level, so each item's focus ring wraps only its row.
const ITEM = cx(
  "flex cursor-default select-none focus-visible:-outline-offset-2 transition-colors duration-instant",
  "ui-hover:bg-raised",
);

function RelationItem({
  relation,
  expanded,
  retired,
  position,
  size,
  selected,
  ...item
}: ItemProps & {
  readonly relation: CatalogRelation;
  readonly expanded: boolean | undefined;
  readonly retired: number;
}) {
  const nameId = useId();
  const metaId = useId();
  const meta = relation.problem
    ? `Can't read: ${relation.problem}`
    : [
        relation.layer === "bronze" && relation.batches.length > 0
          ? `${relation.batches.length === 1 ? "batch" : "batches"} ${batchRanges(relation.batches)}`
          : null,
        relation.layer === "bronze" && retired > 0 ? `${formatCount(retired)} retired` : null,
        relation.layer === "bronze" && relation.batches.length === 0 ? "no rows held" : null,
        plural(relation.columns.length, "column", "columns"),
      ]
        .filter((part) => part !== null)
        .join(" · ");

  return (
    <li
      {...item}
      role="treeitem"
      aria-selected={selected}
      aria-level={1}
      aria-posinset={position}
      aria-setsize={size}
      aria-expanded={expanded}
      aria-labelledby={nameId}
      aria-describedby={metaId}
      className={cx(
        ITEM,
        "items-start gap-1.5 py-1.5 pr-4 pl-4",
        expanded !== undefined && "cursor-pointer",
      )}
    >
      <ChevronIcon
        className={cx(
          "mt-0.5 size-4 shrink-0 text-smoke transition-transform duration-fast motion-calm:transition-none",
          expanded === true && "rotate-90",
          expanded === undefined && "invisible",
        )}
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-baseline gap-3">
          <span id={nameId} className="min-w-0 truncate type-data">
            <span className="text-smoke">{relation.layer}.</span>
            <span className="text-moon">{relation.name}</span>
          </span>
          <span className="ms-auto shrink-0 text-ash type-data-s">
            {relation.rowCount === null ? relation.kind : plural(relation.rowCount, "row", "rows")}
          </span>
        </div>
        <span
          id={metaId}
          className={cx(
            "type-data-s",
            relation.problem ? "line-clamp-2 text-snuffed" : "truncate text-smoke",
          )}
        >
          {meta}
        </span>
      </div>
    </li>
  );
}

function ColumnItem({
  column,
  pickable,
  position,
  size,
  selected,
  ...item
}: ItemProps & {
  readonly column: { readonly name: string; readonly type: string };
  readonly pickable: boolean;
}) {
  const system = column.name === "_batch" || column.name === "_seq";
  return (
    <li
      {...item}
      role="treeitem"
      aria-selected={selected}
      aria-level={2}
      aria-posinset={position}
      aria-setsize={size}
      className={cx(ITEM, "h-7 items-center gap-3 pr-4 pl-9.5", pickable && "cursor-pointer")}
    >
      <span className={cx("min-w-0 truncate type-data", system ? "text-ash" : "text-parchment")}>
        {column.name}
      </span>
      <span className="ms-auto shrink-0 text-smoke type-data-s">{column.type}</span>
    </li>
  );
}
