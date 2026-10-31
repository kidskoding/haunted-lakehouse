"use client";

import { useState, type KeyboardEvent, type PointerEvent } from "react";
import { cx } from "@/components/ui/cx";
import { keyAction, type PaneSide, type SplitterOrientation } from "./layout";

export interface SplitterProps {
  /** `vertical` divides left from right; `horizontal` divides top from bottom. */
  readonly orientation: SplitterOrientation;
  /** Names the pane this splitter sizes: "Resize the story". */
  readonly label: string;
  /** The pane's current share, and the range it may take. */
  readonly value: number;
  readonly min: number;
  readonly max: number;
  /** Spoken in place of the bare number: "Story, 55% of the column". */
  readonly valueText: string;
  /** The id of the pane this splitter sizes. */
  readonly controls: string;
  /** Where that pane sits relative to the splitter. */
  readonly side: PaneSide;
  /** The pane's share at a pointer position, from the region's measured box. */
  readonly shareAt: (clientX: number, clientY: number) => number;
  /** A new share. `commit` is false while a drag is still moving. */
  readonly onResize: (value: number, commit: boolean) => void;
  /** Ends a drag at its last value. */
  readonly onCommit: () => void;
  readonly onReset: () => void;
  readonly onDragChange?: (dragging: boolean) => void;
}

/**
 * A window splitter (WAI-ARIA separator): drag it, or focus it and use the arrows along its
 * axis (Shift for bigger steps), Home and End for the pane's smallest and largest size, and
 * Enter or a double-click to restore the default. At rest it is the one-pixel seam between
 * two panels; its hit area reaches four pixels into each.
 */
export function Splitter({
  orientation,
  label,
  value,
  min,
  max,
  valueText,
  controls,
  side,
  shareAt,
  onResize,
  onCommit,
  onReset,
  onDragChange,
}: SplitterProps) {
  const [dragging, setDragging] = useState(false);
  const vertical = orientation === "vertical";

  const endDrag = () => {
    if (!dragging) return;
    setDragging(false);
    onDragChange?.(false);
    onCommit();
  };

  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    // Keep text from being selected across the panels while the line moves.
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    event.currentTarget.focus({ preventScroll: true });
    setDragging(true);
    onDragChange?.(true);
  };

  const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (!dragging) return;
    onResize(shareAt(event.clientX, event.clientY), false);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const action = keyAction(event.key, event.shiftKey, orientation, side);
    if (action === null) return;
    event.preventDefault();
    switch (action.kind) {
      case "step":
        onResize(value + action.delta, true);
        return;
      case "min":
        onResize(min, true);
        return;
      case "max":
        onResize(max, true);
        return;
      case "reset":
        onReset();
        return;
    }
  };

  return (
    <div
      role="separator"
      tabIndex={0}
      aria-orientation={orientation}
      aria-label={label}
      aria-controls={controls}
      aria-valuenow={Math.round(value)}
      aria-valuemin={Math.round(min)}
      aria-valuemax={Math.round(max)}
      aria-valuetext={valueText}
      data-dragging={dragging || undefined}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      // Fires once a drag ends for any reason: release, cancel, or the capture being taken.
      onLostPointerCapture={endDrag}
      onDoubleClick={onReset}
      onKeyDown={handleKeyDown}
      className={cx(
        "group/splitter relative z-10 touch-none bg-line-faint",
        // The hit area: invisible, and wider than the seam it belongs to.
        "before:absolute before:content-['']",
        vertical
          ? "w-px cursor-col-resize before:inset-y-0 before:-inset-x-1"
          : "h-px cursor-row-resize before:inset-x-0 before:-inset-y-1",
      )}
    >
      {/* The lit line: two pixels, drawn over the seam so nothing shifts. */}
      <span
        aria-hidden="true"
        className={cx(
          "pointer-events-none absolute opacity-0 transition-[opacity,background-color] duration-fast",
          vertical ? "inset-y-0 -left-px w-0.5" : "inset-x-0 -top-px h-0.5",
          "bg-flame group-hover/splitter:opacity-100 group-data-dragging/splitter:opacity-100",
          "group-focus-visible/splitter:bg-glow group-focus-visible/splitter:opacity-100",
        )}
      />
    </div>
  );
}
