"use client";

import { createContext, useContext, useId, type ComponentPropsWithoutRef } from "react";
import { cx } from "./cx";
import { AlertIcon } from "./icons";

const PanelContext = createContext<string | null>(null);

/**
 * A flat region of the run screen (art direction §5.5): `panel` fill, square corners, no
 * border. It is a named landmark (its `PanelTitle`), and while focus is anywhere inside it the
 * header lights with a `flame` bar and the title brightens, so the player sees where they are.
 */
export function Panel({ className, ...props }: ComponentPropsWithoutRef<"section">) {
  const titleId = useId();
  return (
    <PanelContext value={titleId}>
      <section
        aria-labelledby={titleId}
        className={cx("group/panel flex min-h-0 flex-col bg-panel", className)}
        {...props}
      />
    </PanelContext>
  );
}

/** The 36px header row: a title on the left, `PanelActions` on the right. */
export function PanelHeader({ className, ...props }: ComponentPropsWithoutRef<"header">) {
  return (
    <header
      className={cx(
        "relative flex h-9 shrink-0 items-center justify-between gap-3 border-b border-line-faint",
        "pr-1 pl-4",
        // The focus bar: drawn, not bordered, so the header keeps its height either way.
        "before:absolute before:inset-x-0 before:top-0 before:h-0.5 before:bg-flame",
        "before:opacity-0 before:transition-opacity before:duration-fast",
        "group-ui-focus-within/panel:before:opacity-100",
        className,
      )}
      {...props}
    />
  );
}

export function PanelTitle({ className, ...props }: ComponentPropsWithoutRef<"h2">) {
  const titleId = useContext(PanelContext);
  if (titleId === null) throw new Error("PanelTitle must be used inside a Panel.");
  return (
    <h2
      id={titleId}
      className={cx(
        "truncate text-ash type-ui-l transition-colors duration-fast",
        "group-ui-focus-within/panel:text-parchment",
        className,
      )}
      {...props}
    />
  );
}

/** Quiet 28px icon buttons, each inside a `Tooltip`. */
export function PanelActions({ className, ...props }: ComponentPropsWithoutRef<"div">) {
  return <div className={cx("flex items-center gap-0.5", className)} {...props} />;
}

export function PanelBody({ className, ...props }: ComponentPropsWithoutRef<"div">) {
  return <div className={cx("min-h-0 flex-1 overflow-auto p-4", className)} {...props} />;
}

/** What an empty panel says, and usually how to fill it. */
export function PanelEmpty({ className, ...props }: ComponentPropsWithoutRef<"p">) {
  return (
    <p
      className={cx("mx-auto max-w-copy py-6 text-center text-pretty text-ash type-ui", className)}
      {...props}
    />
  );
}

export interface PanelSkeletonProps {
  /** What is loading, for screen readers: "Loading the story". */
  readonly label: string;
  /** Bar widths as fractions of the line; three by default, like a paragraph arriving. */
  readonly lines?: readonly number[];
}

/**
 * Placeholder lines while content loads: `fog` bars with a slow shimmer, held still under
 * reduced motion. Announced once through `role="status"`.
 */
export function PanelSkeleton({ label, lines = [0.92, 0.84, 0.58] }: PanelSkeletonProps) {
  return (
    <div role="status" className="flex flex-col gap-3 py-1">
      <span className="sr-only">{label}</span>
      {lines.map((width, index) => (
        <span
          // The bars are interchangeable and never reorder.
          key={index}
          aria-hidden="true"
          style={{ width: `${String(width * 100)}%` }}
          className={cx(
            "h-3 rounded-xs bg-fog/60 animate-pulse [animation-duration:2.4s]",
            "motion-calm:animate-none",
          )}
        />
      ))}
    </div>
  );
}

export interface PanelErrorProps extends ComponentPropsWithoutRef<"div"> {
  /** What went wrong, in the town's voice: "The story didn't arrive." */
  readonly message: string;
}

/**
 * A failure inside a panel: `tint.snuffed` wash, the alert glyph, the message, and whatever
 * recovery buttons are passed as children (Retry, Copy details). Announced as an alert.
 */
export function PanelError({ message, className, children, ...props }: PanelErrorProps) {
  return (
    <div
      role="alert"
      className={cx(
        "flex flex-col gap-3 rounded-xs border-l-3 border-snuffed bg-tint-snuffed px-4 py-3",
        className,
      )}
      {...props}
    >
      <p className="flex items-start gap-2 text-parchment type-ui">
        <AlertIcon className="mt-0.5 size-4 shrink-0 text-snuffed" />
        <span>{message}</span>
      </p>
      {children ? <div className="flex flex-wrap gap-2 pl-6">{children}</div> : null}
    </div>
  );
}
