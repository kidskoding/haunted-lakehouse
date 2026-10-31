"use client";

import { useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
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
  readonly onReset: () => void;
  /** A drag starting or ending. One that ends without a release was cancelled. */
  readonly onDragChange?: (dragging: boolean) => void;
}

/**
 * A window splitter (WAI-ARIA separator): drag it, or focus it and use the arrows along its
 * axis (Shift for bigger steps), Home and End for the pane's smallest and largest size, and
 * Enter or a double-click to restore the default. At rest it is the four-pixel gutter between
 * two panes; it shows the control line on hover, focus, and drag. Its hit area reaches four
 * pixels into the pane after it, clear of the scrollbars on a pane's right and bottom edges.
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
  onReset,
  onDragChange,
}: SplitterProps) {
  const [dragging, setDragging] = useState(false);
  // The pointer driving a drag. A ref rather than state: the browser can deliver the last move
  // and the release in one task, before React has rendered the drag starting or moving.
  const dragPointer = useRef<number | null>(null);
  const vertical = orientation === "vertical";

  const endDrag = () => {
    if (dragPointer.current === null) return;
    dragPointer.current = null;
    setDragging(false);
    onDragChange?.(false);
  };

  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    // Keep text from being selected across the panels while the line moves.
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    event.currentTarget.focus({ preventScroll: true });
    dragPointer.current = event.pointerId;
    setDragging(true);
    onDragChange?.(true);
  };

  const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (dragPointer.current !== event.pointerId) return;
    onResize(shareAt(event.clientX, event.clientY), false);
  };

  const handlePointerUp = (event: PointerEvent<HTMLDivElement>) => {
    if (dragPointer.current !== event.pointerId) return;
    // Commit where the pointer let go, not the last rendered move, which may be stale.
    onResize(shareAt(event.clientX, event.clientY), true);
    endDrag();
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
      onPointerUp={handlePointerUp}
      // Losing the capture without a release is a cancel: the drag ends uncommitted.
      onLostPointerCapture={endDrag}
      onDoubleClick={onReset}
      onKeyDown={handleKeyDown}
      className={cx(
        "relative z-10 touch-none bg-night transition-colors duration-fast",
        "hover:bg-line-control focus-visible:bg-line-control data-dragging:bg-line-control",
        // The hit area: the gutter, plus four invisible pixels into the pane after it.
        "before:absolute before:content-['']",
        vertical
          ? "w-1 cursor-col-resize before:inset-y-0 before:left-0 before:-right-1"
          : "h-1 cursor-row-resize before:inset-x-0 before:top-0 before:-bottom-1",
      )}
    />
  );
}
