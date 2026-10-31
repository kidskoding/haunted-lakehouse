"use client";

import {
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import type { QueryCell, QueryResult } from "@/lib/engine/protocol";
import { Button } from "@/components/ui/button";
import { formatCell, formatCount, isNumericColumn, toTsv } from "./format";
import { bodyScale, columnOffsets, columnWindow, reveal, rowWindow } from "./windowing";

const ROW_HEIGHT = 28;
const HEADER_HEIGHT = 48;
const OVERSCAN_ROWS = 6;
const OVERSCAN_COLUMNS = 2;
const MIN_WIDTH = 56;
const MAX_WIDTH = 640;
const RESIZE_STEP = 8;
const RESIZE_BIG_STEP = 32;
// JetBrains Mono at the data size is about 7.8px a character.
const CHAR_PX = 8;
const CELL_PADDING_PX = 24;
const SAMPLE_ROWS = 200;
const SAMPLE_CHARS = 40;
const STATUS_MS = 4000;

interface Cell {
  readonly row: number;
  readonly col: number;
}

interface Selection {
  readonly active: Cell | null;
  readonly anchor: Cell | null;
}

interface Rect {
  readonly top: number;
  readonly bottom: number;
  readonly left: number;
  readonly right: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function rectOf({ active, anchor }: Selection): Rect | null {
  if (!active || !anchor) return null;
  return {
    top: Math.min(active.row, anchor.row),
    bottom: Math.max(active.row, anchor.row),
    left: Math.min(active.col, anchor.col),
    right: Math.max(active.col, anchor.col),
  };
}

/** Starting widths from the header and a sample of rows, so most values fit untruncated. */
function estimateWidths({ columns, rows }: QueryResult): number[] {
  return columns.map((column, c) => {
    let chars = Math.max(column.name.length, column.type.length);
    for (const row of rows.slice(0, SAMPLE_ROWS)) {
      chars = Math.max(chars, Math.min(SAMPLE_CHARS, formatCell(row[c] ?? null).text.length));
    }
    return clamp(chars * CHAR_PX + CELL_PADDING_PX, MIN_WIDTH + 16, 320);
  });
}

function gutterWidth(rowCount: number): number {
  return Math.max(48, formatCount(rowCount).length * CHAR_PX + 20);
}

function plural(count: number, word: string): string {
  return `${formatCount(count)} ${word}${count === 1 ? "" : "s"}`;
}

/** The panel's top bar, shared by every state so the frame never jumps between them. */
export function ResultsToolbar({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <div className="flex h-11 shrink-0 items-center gap-3 border-b border-line-faint px-3">
      {children}
    </div>
  );
}

interface ResizeHandleProps {
  readonly name: string;
  readonly width: number;
  readonly onResize: (width: number) => void;
}

/** The splitter on a column's right edge: drag it, or focus it and use the arrow keys. */
function ResizeHandle({ name, width, onResize }: ResizeHandleProps) {
  const drag = useRef<{ readonly x: number; readonly width: number } | null>(null);

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const step = event.shiftKey ? RESIZE_BIG_STEP : RESIZE_STEP;
    const next =
      event.key === "ArrowLeft"
        ? width - step
        : event.key === "ArrowRight"
          ? width + step
          : event.key === "Home"
            ? MIN_WIDTH
            : event.key === "End"
              ? MAX_WIDTH
              : null;
    if (next === null) return;
    event.preventDefault();
    event.stopPropagation();
    onResize(next);
  }

  function onPointerDown(event: PointerEvent<HTMLDivElement>) {
    if (event.button !== 0) return;
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { x: event.clientX, width };
  }

  function onPointerMove(event: PointerEvent<HTMLDivElement>) {
    const start = drag.current;
    if (start) onResize(start.width + event.clientX - start.x);
  }

  function onPointerEnd() {
    drag.current = null;
  }

  return (
    <div
      role="separator"
      tabIndex={0}
      aria-orientation="vertical"
      aria-label={`Resize column ${name}`}
      aria-valuenow={width}
      aria-valuemin={MIN_WIDTH}
      aria-valuemax={MAX_WIDTH}
      aria-valuetext={`${String(width)} pixels`}
      onKeyDown={onKeyDown}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerEnd}
      onPointerCancel={onPointerEnd}
      className="group/handle absolute top-0 right-0 flex h-full w-2 cursor-col-resize touch-none justify-end"
    >
      <span className="h-full w-px bg-line-faint transition-colors duration-fast group-hover/handle:w-0.5 group-hover/handle:bg-flame group-focus-visible/handle:w-0.5 group-focus-visible/handle:bg-glow group-active/handle:w-0.5 group-active/handle:bg-flame" />
    </div>
  );
}

export interface ResultsGridProps {
  readonly result: QueryResult;
  /** The row cap the query ran under; reaching it shows a notice that rows may be missing. */
  readonly limit?: number;
  /** The grid's accessible name. */
  readonly label?: string;
}

// Each result gets its own grid instance, so widths, scroll, and selection reset with it.
const resultKeys = new WeakMap<QueryResult, number>();
let nextResultKey = 0;
function keyOf(result: QueryResult): number {
  let key = resultKeys.get(result);
  if (key === undefined) {
    key = nextResultKey++;
    resultKeys.set(result, key);
  }
  return key;
}

/**
 * A query result as a virtualized ARIA grid: rows and columns render only near the viewport,
 * columns resize by mouse or keyboard, and cells or the whole result copy as TSV.
 */
export function ResultsGrid(props: ResultsGridProps) {
  return <Grid key={keyOf(props.result)} {...props} />;
}

function Grid({ result, limit, label = "Query results" }: ResultsGridProps) {
  const { columns, rows } = result;
  const id = useId();
  const scrollerRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);
  const [widths, setWidths] = useState(() => estimateWidths(result));
  const [scroll, setScroll] = useState({ top: 0, left: 0 });
  const [viewport, setViewport] = useState({ width: 0, height: 0 });
  const [selection, setSelection] = useState<Selection>(() => {
    const first = rows.length > 0 && columns.length > 0 ? { row: 0, col: 0 } : null;
    return { active: first, anchor: first };
  });
  const [status, setStatus] = useState("");

  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    const observer = new ResizeObserver(() => {
      setViewport({ width: scroller.clientWidth, height: scroller.clientHeight });
    });
    observer.observe(scroller);
    return () => {
      observer.disconnect();
    };
  }, []);

  useEffect(() => {
    if (status === "") return;
    const timer = setTimeout(() => {
      setStatus("");
    }, STATUS_MS);
    return () => {
      clearTimeout(timer);
    };
  }, [status]);

  const numeric = useMemo(() => columns.map(isNumericColumn), [columns]);
  const offsets = useMemo(() => columnOffsets(widths), [widths]);
  const gutter = gutterWidth(rows.length);
  const totalWidth = gutter + (offsets.at(-1) ?? 0);
  const bodyViewport = Math.max(0, viewport.height - HEADER_HEIGHT);
  const scale = bodyScale(rows.length, ROW_HEIGHT, bodyViewport);
  const virtualTop = scroll.top * scale.ratio;
  const rowSpan = rowWindow(virtualTop, bodyViewport, ROW_HEIGHT, rows.length, OVERSCAN_ROWS);
  const colSpan = columnWindow(offsets, scroll.left, viewport.width - gutter, OVERSCAN_COLUMNS);
  // Where the first rendered row sits in the laid-out body; exact whenever nothing is scaled.
  const blockTop = rowSpan.start * ROW_HEIGHT - virtualTop + scroll.top;
  const rect = rectOf(selection);
  const { active } = selection;
  const cellId = (cell: Cell) => `${id}-${String(cell.row)}-${String(cell.col)}`;
  const activeRendered =
    active !== null &&
    active.row >= rowSpan.start &&
    active.row < rowSpan.end &&
    active.col >= colSpan.start &&
    active.col < colSpan.end;

  function inRect(row: number, col: number): boolean {
    return (
      rect !== null &&
      row >= rect.top &&
      row <= rect.bottom &&
      col >= rect.left &&
      col <= rect.right
    );
  }

  function resizeColumn(col: number, width: number) {
    setWidths((current) =>
      current.map((w, c) => (c === col ? clamp(Math.round(width), MIN_WIDTH, MAX_WIDTH) : w)),
    );
  }

  async function copy(text: string, done: string) {
    try {
      await navigator.clipboard.writeText(text);
      setStatus(done);
    } catch {
      setStatus("Couldn't copy: the browser blocked the clipboard.");
    }
  }

  function copySelection() {
    if (!rect) return;
    const height = rect.bottom - rect.top + 1;
    const width = rect.right - rect.left + 1;
    const block = rows
      .slice(rect.top, rect.bottom + 1)
      .map((row) => row.slice(rect.left, rect.right + 1));
    void copy(
      toTsv(block),
      height * width === 1
        ? "Copied 1 cell"
        : `Copied ${plural(height, "row")} by ${plural(width, "column")}`,
    );
  }

  function copyAll() {
    void copy(
      toTsv(
        rows,
        columns.map((column) => column.name),
      ),
      `Copied ${plural(rows.length, "row")} with the header`,
    );
  }

  /** Scrolls just enough to show a cell whole, and renders its window in the same pass. */
  function revealCell(cell: Cell) {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    const currentTop = scroller.scrollTop * scale.ratio;
    const top = reveal(
      currentTop,
      bodyViewport,
      cell.row * ROW_HEIGHT,
      (cell.row + 1) * ROW_HEIGHT,
    );
    if (top !== currentTop) {
      // Round away from the row so a scaled body never leaves it a pixel short of view.
      const physical = top / scale.ratio;
      scroller.scrollTop = top > currentTop ? Math.ceil(physical) : Math.floor(physical);
    }
    scroller.scrollLeft = reveal(
      scroller.scrollLeft,
      Math.max(0, scroller.clientWidth - gutter),
      offsets[cell.col] ?? 0,
      offsets[cell.col + 1] ?? 0,
    );
    setScroll({ top: scroller.scrollTop, left: scroller.scrollLeft });
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    // Keys pressed on a resize handle belong to it.
    if (event.target !== event.currentTarget) return;
    const mod = event.ctrlKey || event.metaKey;
    const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
    if (mod && key === "c") {
      event.preventDefault();
      copySelection();
      return;
    }
    if (mod && key === "a" && rows.length > 0 && columns.length > 0) {
      event.preventDefault();
      setSelection({
        anchor: { row: 0, col: 0 },
        active: { row: rows.length - 1, col: columns.length - 1 },
      });
      return;
    }
    if (!active) return;
    if (key === "Escape") {
      setSelection({ active, anchor: active });
      return;
    }
    const lastRow = rows.length - 1;
    const lastCol = columns.length - 1;
    const page = Math.max(1, Math.floor(bodyViewport / ROW_HEIGHT) - 1);
    const { row, col } = active;
    const moves: Readonly<Record<string, Cell>> = {
      ArrowUp: { row: mod ? 0 : row - 1, col },
      ArrowDown: { row: mod ? lastRow : row + 1, col },
      ArrowLeft: { row, col: mod ? 0 : col - 1 },
      ArrowRight: { row, col: mod ? lastCol : col + 1 },
      Home: { row: mod ? 0 : row, col: 0 },
      End: { row: mod ? lastRow : row, col: lastCol },
      PageUp: { row: row - page, col },
      PageDown: { row: row + page, col },
    };
    const move = moves[key];
    if (!move) return;
    event.preventDefault();
    const next = { row: clamp(move.row, 0, lastRow), col: clamp(move.col, 0, lastCol) };
    setSelection({ active: next, anchor: event.shiftKey ? (selection.anchor ?? active) : next });
    revealCell(next);
  }

  function cellAt(target: EventTarget): Cell | null {
    if (!(target instanceof Element)) return null;
    const cell = target.closest<HTMLElement>("[data-row]");
    if (!cell) return null;
    return { row: Number(cell.dataset.row), col: Number(cell.dataset.col) };
  }

  function onPointerDown(event: PointerEvent<HTMLDivElement>) {
    if (event.button !== 0) return;
    const cell = cellAt(event.target);
    if (!cell) return;
    dragging.current = true;
    setSelection((current) => ({
      active: cell,
      anchor: event.shiftKey ? (current.anchor ?? cell) : cell,
    }));
  }

  function onPointerMove(event: PointerEvent<HTMLDivElement>) {
    if (!dragging.current) return;
    if (event.buttons !== 1) {
      dragging.current = false;
      return;
    }
    const cell = cellAt(event.target);
    if (cell) setSelection((current) => ({ ...current, active: cell }));
  }

  function onPointerUp() {
    dragging.current = false;
  }

  const empty = rows.length === 0 || columns.length === 0;
  const single = rect !== null && rect.top === rect.bottom && rect.left === rect.right;
  const limited = limit !== undefined && rows.length >= limit;
  const activeColumn = active ? columns[active.col] : undefined;
  const activeValue = active ? formatCell(rows[active.row]?.[active.col] ?? null) : null;
  const visibleCols = Array.from(
    { length: colSpan.end - colSpan.start },
    (_, i) => colSpan.start + i,
  );

  function renderCell(row: number, col: number, value: QueryCell) {
    const { text, kind } = formatCell(value);
    const selected = inRect(row, col);
    const isActive = active !== null && active.row === row && active.col === col;
    return (
      <div
        key={col}
        id={cellId({ row, col })}
        role="gridcell"
        aria-colindex={col + 2}
        aria-selected={selected}
        data-row={row}
        data-col={col}
        style={{ left: gutter + (offsets[col] ?? 0), width: widths[col] }}
        className={[
          "absolute top-0 h-full truncate px-3 type-data leading-[27px]",
          numeric[col] ? "text-right" : "",
          kind === "null" ? "text-smoke italic" : "text-parchment",
          selected ? "bg-tint-flame" : "",
          isActive
            ? "outline outline-offset-[-1px] outline-flame group-focus-visible/grid:outline-2 group-focus-visible/grid:outline-offset-[-2px] group-focus-visible/grid:outline-glow"
            : "",
        ].join(" ")}
      >
        {text}
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-panel">
      <ResultsToolbar>
        <p className="type-ui-s text-ash tabular-nums">
          {plural(rows.length, "row")}
          <span className="text-smoke"> · {plural(columns.length, "column")}</span>
        </p>
        {limited && (
          <p className="type-ui-s text-tallow tabular-nums">
            Stopped at the {formatCount(limit)} row limit; later rows are not shown.
          </p>
        )}
        <p role="status" className="ms-auto truncate type-ui-s text-flame">
          {status}
        </p>
        <Button
          size="sm"
          variant="ghost"
          disabled={rect === null}
          aria-keyshortcuts="Control+C Meta+C"
          onClick={copySelection}
        >
          {single ? "Copy cell" : "Copy selection"}
        </Button>
        <Button size="sm" variant="ghost" disabled={empty} onClick={copyAll}>
          Copy all rows
        </Button>
      </ResultsToolbar>

      <div className="relative min-h-0 flex-1">
        <div
          ref={scrollerRef}
          role="grid"
          aria-label={label}
          aria-rowcount={rows.length + 1}
          aria-colcount={columns.length + 1}
          aria-multiselectable="true"
          aria-activedescendant={activeRendered ? cellId(active) : undefined}
          tabIndex={0}
          onScroll={(event) => {
            setScroll({ top: event.currentTarget.scrollTop, left: event.currentTarget.scrollLeft });
          }}
          onKeyDown={onKeyDown}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          className={[
            "group/grid absolute inset-0 overflow-auto overscroll-contain",
            active ? "focus-visible:outline-none focus-visible:[box-shadow:none]" : "",
          ].join(" ")}
        >
          <div
            className="relative"
            style={{ width: totalWidth, height: HEADER_HEIGHT + scale.physicalHeight }}
          >
            <div
              role="row"
              aria-rowindex={1}
              className="sticky top-0 z-20 border-b border-line-strong bg-panel"
              style={{ width: totalWidth, height: HEADER_HEIGHT }}
            >
              <div
                role="columnheader"
                aria-colindex={1}
                className="sticky left-0 z-10 h-full border-r border-line-faint bg-panel"
                style={{ width: gutter }}
              >
                <span className="sr-only">Row</span>
              </div>
              {visibleCols.map((col) => {
                const column = columns[col];
                if (!column) return null;
                return (
                  <div
                    key={col}
                    role="columnheader"
                    aria-colindex={col + 2}
                    title={`${column.name} (${column.type})`}
                    className={[
                      "absolute top-0 flex h-full flex-col justify-center px-3",
                      numeric[col] ? "items-end text-right" : "items-start",
                    ].join(" ")}
                    style={{ left: gutter + (offsets[col] ?? 0), width: widths[col] }}
                  >
                    <span className="max-w-full truncate type-ui-s font-semibold text-ash">
                      {column.name}
                    </span>
                    <span className="max-w-full truncate type-data-s text-smoke">
                      {column.type}
                    </span>
                    <ResizeHandle
                      name={column.name}
                      width={widths[col] ?? MIN_WIDTH}
                      onResize={(width) => {
                        resizeColumn(col, width);
                      }}
                    />
                  </div>
                );
              })}
            </div>

            <div
              className="absolute left-0 select-none"
              style={{ top: HEADER_HEIGHT + blockTop, width: totalWidth }}
            >
              {Array.from({ length: rowSpan.end - rowSpan.start }, (_, i) => {
                const row = rowSpan.start + i;
                const values = rows[row] ?? [];
                const rowSelected = rect !== null && row >= rect.top && row <= rect.bottom;
                return (
                  <div
                    key={row}
                    role="row"
                    aria-rowindex={row + 2}
                    className="absolute left-0 border-b border-line-faint"
                    style={{ top: i * ROW_HEIGHT, height: ROW_HEIGHT, width: totalWidth }}
                  >
                    <div
                      role="rowheader"
                      aria-colindex={1}
                      className={[
                        "sticky left-0 z-10 h-full border-r border-line-faint bg-panel px-2 text-right type-data-s leading-[27px]",
                        rowSelected ? "text-ash" : "text-smoke",
                      ].join(" ")}
                      style={{ width: gutter }}
                    >
                      {formatCount(row + 1)}
                    </div>
                    {visibleCols.map((col) => renderCell(row, col, values[col] ?? null))}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
        {empty && (
          <p
            className="absolute inset-x-0 px-4 py-4 type-ui text-ash"
            style={{ top: HEADER_HEIGHT }}
          >
            {columns.length === 0
              ? "The statement ran and returned no columns."
              : "The query ran and returned no rows."}
          </p>
        )}
      </div>

      <div className="flex min-h-11 shrink-0 items-baseline gap-3 border-t border-line-faint px-3 py-2.5">
        {active && activeColumn && activeValue ? (
          <>
            <p className="shrink-0 type-ui-s text-smoke tabular-nums">
              Row {formatCount(active.row + 1)} · {activeColumn.name}
            </p>
            <p
              tabIndex={0}
              aria-label={`Full value of row ${formatCount(active.row + 1)}, ${activeColumn.name}`}
              className={[
                "max-h-16 min-w-0 flex-1 overflow-auto break-all whitespace-pre-wrap type-data",
                activeValue.kind === "null" ? "text-smoke italic" : "text-parchment",
              ].join(" ")}
            >
              {activeValue.text === "" ? (
                <span className="text-smoke">(empty string)</span>
              ) : (
                activeValue.text
              )}
            </p>
          </>
        ) : (
          <p className="type-ui-s text-smoke">Select a cell to read its full value.</p>
        )}
      </div>
    </div>
  );
}
