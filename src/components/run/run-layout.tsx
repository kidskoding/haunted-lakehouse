"use client";

import { useEffect, useId, useRef, useState, type ReactNode, type RefObject } from "react";
import { cx } from "@/components/ui/cx";
import {
  clampLayout,
  DEFAULT_LAYOUT,
  editorShare,
  GUTTER_REM,
  NO_FLOORS,
  paneBounds,
  setPane,
  shareAt,
  TRACK_FLOOR_REM,
  trackFloors,
  type PaneId,
  type PaneSide,
  type RunLayoutSizes,
  type SplitterOrientation,
  type Track,
  type TrackFloors,
} from "./layout";
import { useSavedLayout } from "./layout-store";
import { Splitter } from "./splitter";

export interface RunLayoutProps {
  /** The screen's heading for assistive technology: the hour being played. */
  readonly title: string;
  /** Candles, the night clock, and the seed. */
  readonly topBar: ReactNode;
  readonly story: ReactNode;
  readonly tables: ReactNode;
  readonly dag: ReactNode;
  readonly editor: ReactNode;
  readonly results: ReactNode;
  /** Relics and the two run buttons. */
  readonly bottomBar: ReactNode;
  /** Shown instead of the run screen below 1280px. */
  readonly narrow?: ReactNode;
}

interface SplitSpec {
  readonly pane: PaneId;
  readonly orientation: SplitterOrientation;
  readonly side: PaneSide;
  readonly label: string;
  readonly valueText: (sizes: RunLayoutSizes) => string;
}

const SPLITS: Readonly<Record<PaneId, SplitSpec>> = {
  left: {
    pane: "left",
    orientation: "vertical",
    side: "before",
    label: "Resize the story and tables column",
    valueText: (sizes) => `Story and tables, ${String(Math.round(sizes.left))}% of the width`,
  },
  story: {
    pane: "story",
    orientation: "horizontal",
    side: "before",
    label: "Resize the story",
    valueText: (sizes) => `Story, ${String(Math.round(sizes.story))}% of the column`,
  },
  dag: {
    pane: "dag",
    orientation: "horizontal",
    side: "before",
    label: "Resize the pipeline",
    valueText: (sizes) => `Pipeline, ${String(Math.round(sizes.dag))}% of the column`,
  },
  results: {
    pane: "results",
    orientation: "horizontal",
    side: "after",
    label: "Resize the results",
    valueText: (sizes) => `Results, ${String(Math.round(sizes.results))}% of the column`,
  },
};

/**
 * The run screen's frame: the top bar, a left column (story over tables), a right column
 * (DAG, editor, results), and the bottom bar, split by keyboard- and pointer-resizable
 * gutters. Sizes are remembered per browser. It renders whatever it is given in each slot and
 * holds no game state; below 1280px it shows `narrow` instead.
 */
export function RunLayout({
  title,
  topBar,
  story,
  tables,
  dag,
  editor,
  results,
  bottomBar,
  narrow = <RunLayoutNarrow />,
}: RunLayoutProps) {
  const [saved, save] = useSavedLayout();
  // A drag shows its sizes live and is saved once, when the pointer lets go.
  const [draft, setDraft] = useState<RunLayoutSizes | null>(null);
  const [dragAxis, setDragAxis] = useState<SplitterOrientation | null>(null);
  const [floors, setFloors] = useState<TrackFloors>(NO_FLOORS);
  // The player's chosen sizes stay as chosen; what this window can give is shown and offered.
  const chosen = draft ?? saved;
  const sizes = clampLayout(chosen, floors);

  const columnsRef = useRef<HTMLElement>(null);
  const leftRef = useRef<HTMLDivElement>(null);
  const rightRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const columns = columnsRef.current;
    const left = leftRef.current;
    const right = rightRef.current;
    if (columns === null || left === null || right === null) return;
    const observer = new ResizeObserver(() => {
      const remPx = Number.parseFloat(getComputedStyle(document.documentElement).fontSize);
      const next = trackFloors(
        {
          width: columns.clientWidth,
          leftHeight: left.clientHeight,
          rightHeight: right.clientHeight,
        },
        remPx,
      );
      const tracks = Object.keys(TRACK_FLOOR_REM) as Track[];
      setFloors((prev) => (tracks.every((track) => prev[track] === next[track]) ? prev : next));
    });
    observer.observe(columns);
    observer.observe(left);
    observer.observe(right);
    return () => {
      observer.disconnect();
    };
  }, []);
  const ids: Record<PaneId, string> = {
    left: useId(),
    story: useId(),
    dag: useId(),
    results: useId(),
  };

  const regions: Record<PaneId, RefObject<HTMLElement | null>> = {
    left: columnsRef,
    story: leftRef,
    dag: rightRef,
    results: rightRef,
  };

  const splitter = (pane: PaneId) => {
    const spec = SPLITS[pane];
    const bounds = paneBounds(sizes, pane, floors);
    // Only this pane changes; the others keep the sizes the player chose for them.
    const resized = (value: number): RunLayoutSizes => ({
      ...chosen,
      [pane]: setPane(sizes, pane, value, floors)[pane],
    });
    return (
      <Splitter
        orientation={spec.orientation}
        label={spec.label}
        value={sizes[pane]}
        min={bounds.min}
        max={bounds.max}
        valueText={spec.valueText(sizes)}
        controls={ids[pane]}
        side={spec.side}
        shareAt={(clientX, clientY) => {
          const box = regions[pane].current?.getBoundingClientRect();
          if (box === undefined) return Number.NaN;
          return spec.orientation === "vertical"
            ? shareAt(clientX, box.left, box.width, spec.side)
            : shareAt(clientY, box.top, box.height, spec.side);
        }}
        onResize={(value, commit) => {
          const next = resized(value);
          if (commit) {
            setDraft(null);
            save(next);
          } else {
            setDraft(next);
          }
        }}
        onReset={() => {
          setDraft(null);
          save(resized(DEFAULT_LAYOUT[pane]));
        }}
        onDragChange={(dragging) => {
          setDragAxis(dragging ? spec.orientation : null);
          // A release has already saved; anything left over is a cancelled drag.
          if (!dragging) setDraft(null);
        }}
      />
    );
  };

  return (
    <>
      <div
        data-testid="run-layout"
        className={cx(
          "hidden h-dvh min-h-[40rem] grid-rows-[auto_minmax(0,1fr)_auto] bg-night xl:grid",
          // While a gutter moves, the whole screen wears its cursor and nothing selects.
          dragAxis === "vertical" && "cursor-col-resize select-none",
          dragAxis === "horizontal" && "cursor-row-resize select-none",
        )}
      >
        <h1 className="sr-only">{title}</h1>
        <div className="min-w-0 border-b border-line-faint">{topBar}</div>

        <main
          ref={columnsRef}
          className="grid min-h-0"
          style={{
            gridTemplateColumns: `${track("left", sizes.left)} ${GUTTER} ${track("right", 100 - sizes.left)}`,
          }}
        >
          <div
            ref={leftRef}
            id={ids.left}
            className="grid min-h-0 min-w-0"
            style={{
              gridTemplateRows: `${track("story", sizes.story)} ${GUTTER} ${track("tables", 100 - sizes.story)}`,
            }}
          >
            <Pane id={ids.story}>{story}</Pane>
            {splitter("story")}
            <Pane>{tables}</Pane>
          </div>

          {splitter("left")}

          <div
            ref={rightRef}
            className="grid min-h-0 min-w-0"
            style={{
              gridTemplateRows: `${track("dag", sizes.dag)} ${GUTTER} ${track("editor", editorShare(sizes))} ${GUTTER} ${track("results", sizes.results)}`,
            }}
          >
            <Pane id={ids.dag}>{dag}</Pane>
            {splitter("dag")}
            <Pane>{editor}</Pane>
            {splitter("results")}
            <Pane id={ids.results}>{results}</Pane>
          </div>
        </main>

        <div className="min-w-0 border-t border-line-faint">{bottomBar}</div>
      </div>
      <div className="xl:hidden">{narrow}</div>
    </>
  );
}

const GUTTER = `${String(GUTTER_REM)}rem`;

/**
 * A grid track: its share, never below its rem floor. The splitters' limits already keep each
 * share above its floor once the regions are measured, so the floor only holds the first paint.
 */
function track(name: Track, share: number): string {
  return `minmax(${String(TRACK_FLOOR_REM[name])}rem, ${String(share)}fr)`;
}

/** One pane: it fills its cell and keeps its content from spilling into a neighbour. */
function Pane({ id, children }: { readonly id?: string; readonly children: ReactNode }) {
  return (
    <div id={id} className="flex min-h-0 min-w-0 flex-col overflow-hidden *:min-h-0 *:flex-1">
      {children}
    </div>
  );
}

/**
 * What the run screen shows on a window narrower than 1280px. A placeholder that the mobile
 * item (5.6) will refine; it keeps the player's place rather than squeezing six panels.
 */
export function RunLayoutNarrow() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-copy flex-col justify-center gap-4 px-6 py-16">
      <h1 className="text-balance text-parchment type-display-m">
        Hollow Creek needs a wider window
      </h1>
      <p className="text-pretty text-ash type-prose">
        The night is built on a laptop-sized screen: a story, a pipeline, an editor, and its
        results, side by side. Open this page on a screen at least 1280 pixels wide, or widen the
        window, and the run picks up where it is.
      </p>
    </main>
  );
}
