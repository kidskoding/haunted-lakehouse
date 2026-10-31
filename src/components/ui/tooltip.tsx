"use client";

import {
  cloneElement,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactElement,
  type ReactNode,
} from "react";
import { cx } from "./cx";

/** Hover waits a beat so passing the pointer over a toolbar does not strobe tooltips. */
const showDelayMs = 300;
/** Leaving waits a little too, so the pointer can cross the gap into the tooltip (WCAG 1.4.13). */
const hideDelayMs = 120;

const sides = {
  top: "bottom-full left-1/2 mb-2 -translate-x-1/2",
  bottom: "top-full left-1/2 mt-2 -translate-x-1/2",
  left: "right-full top-1/2 mr-2 -translate-y-1/2",
  right: "left-full top-1/2 ml-2 -translate-y-1/2",
} as const;

export type TooltipSide = keyof typeof sides;

/** The props a trigger receives; any focusable element that spreads them works. */
interface TriggerProps {
  "aria-describedby"?: string;
}

export interface TooltipProps {
  /** What the tooltip says: a label, a sentence of reason, or a label and a `Shortcut`. */
  readonly content: ReactNode;
  /** One focusable element. It is described by the tooltip through `aria-describedby`. */
  readonly children: ReactElement<TriggerProps>;
  readonly side?: TooltipSide;
  /** Starts open, for specimens. The tooltip still closes on Escape and when the pointer leaves. */
  readonly defaultOpen?: boolean;
}

/**
 * A short description that appears when its trigger is hovered or focused (WAI-ARIA APG
 * tooltip pattern). Escape dismisses it without moving focus; it stays open while the
 * pointer is over the tooltip itself, so it can be read at any zoom.
 */
export function Tooltip({ content, children, side = "top", defaultOpen = false }: TooltipProps) {
  const id = useId();
  const [open, setOpen] = useState(defaultOpen);
  const timer = useRef<number | undefined>(undefined);
  const anchorRef = useRef<HTMLSpanElement>(null);

  const schedule = (next: boolean, delay: number) => {
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      setOpen(next);
    }, delay);
  };
  const showNow = () => {
    window.clearTimeout(timer.current);
    setOpen(true);
  };
  const hideNow = () => {
    window.clearTimeout(timer.current);
    setOpen(false);
  };

  useEffect(
    () => () => {
      window.clearTimeout(timer.current);
    },
    [],
  );

  useEffect(() => {
    if (!open) return;
    // Captured on the document so Escape works wherever focus is. While the player is on the
    // trigger (focused or hovering) the key is consumed, so a surrounding dialog stays open
    // and the first Escape closes only the innermost layer; otherwise it passes through.
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      const anchor = anchorRef.current;
      const engaged = anchor
        ? anchor.contains(document.activeElement) || anchor.matches(":hover")
        : false;
      if (engaged) {
        event.preventDefault();
        event.stopPropagation();
      }
      setOpen(false);
    };
    document.addEventListener("keydown", onKeyDown, { capture: true });
    return () => {
      document.removeEventListener("keydown", onKeyDown, { capture: true });
    };
  }, [open]);

  const describedBy = [children.props["aria-describedby"], id].filter(Boolean).join(" ");

  return (
    <span
      ref={anchorRef}
      className="relative inline-flex"
      onPointerEnter={(event) => {
        if (event.pointerType === "mouse") schedule(true, showDelayMs);
      }}
      onPointerLeave={(event) => {
        if (event.pointerType === "mouse") schedule(false, hideDelayMs);
      }}
      onFocus={(event) => {
        // Keyboard focus only: a mouse click focuses a button too, and hover already covers it.
        if (event.target.matches(":focus-visible")) showNow();
      }}
      onBlur={() => {
        // Hover still counts: Tab can leave the trigger while the pointer stays on it, and
        // the tooltip must remain until the pointer leaves (WCAG 1.4.13).
        if (anchorRef.current?.matches(":hover")) return;
        hideNow();
      }}
    >
      {cloneElement(children, { "aria-describedby": describedBy })}
      <span
        id={id}
        role="tooltip"
        data-open={open || undefined}
        className={cx(
          "pointer-events-none invisible absolute z-40 w-max max-w-72 rounded-s bg-raised px-2.5",
          "py-1.5 text-left text-parchment opacity-0 shadow-float type-ui",
          "transition-[opacity,visibility] transition-discrete duration-fast ease-out",
          "data-open:pointer-events-auto data-open:visible data-open:opacity-100",
          sides[side],
        )}
      >
        {content}
      </span>
    </span>
  );
}
