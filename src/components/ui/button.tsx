"use client";

import type { ComponentPropsWithRef, MouseEvent, ReactNode } from "react";
import { base, iconSizes, sizes, type ButtonSize, type ButtonVariant } from "./button-styles";
import { cx } from "./cx";
import { SpinnerIcon } from "./icons";

export type { ButtonSize, ButtonVariant } from "./button-styles";

export interface ButtonProps extends Omit<ComponentPropsWithRef<"button">, "disabled"> {
  readonly variant?: ButtonVariant;
  readonly size?: ButtonSize;
  /**
   * Marks the button unavailable with `aria-disabled` instead of the native attribute, so it
   * stays in the tab order and a tooltip can say why (art direction §5.6). Clicks are ignored.
   */
  readonly disabled?: boolean;
  /**
   * Work is in flight: the button keeps its colors and width, swaps its label for a spinner
   * (the label stays in the accessible name, followed by "working"), reports `aria-busy`, and
   * ignores clicks.
   */
  readonly loading?: boolean;
}

function guardClick(
  unavailable: boolean,
  onClick: ButtonProps["onClick"],
): (event: MouseEvent<HTMLButtonElement>) => void {
  return (event) => {
    if (unavailable) {
      event.preventDefault();
      return;
    }
    onClick?.(event);
  };
}

/**
 * A text button. Put an icon or a `Shortcut` beside the label as children; when the button
 * has a shortcut, also set `aria-keyshortcuts` and hide the keycap from assistive technology.
 */
export function Button({
  variant = "ghost",
  size = "md",
  disabled = false,
  loading = false,
  type = "button",
  className,
  children,
  onClick,
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      aria-disabled={disabled || undefined}
      aria-busy={loading || undefined}
      className={cx(base(variant), sizes[size], className)}
      onClick={guardClick(disabled || loading, onClick)}
      {...props}
    >
      {/* Faded rather than hidden, so the label keeps both the width and the accessible name. */}
      <span className={cx("inline-flex items-center gap-[inherit]", loading && "opacity-0")}>
        {children}
      </span>
      {loading ? (
        <>
          <SpinnerIcon className="absolute inset-0 m-auto" />
          <span className="sr-only">, working</span>
        </>
      ) : null}
    </button>
  );
}

export interface IconButtonProps extends Omit<ButtonProps, "children" | "aria-label"> {
  /** The accessible name. Pair the button with a `Tooltip` that shows the same words. */
  readonly label: string;
  readonly icon: ReactNode;
}

/** A square, icon-only button. It must have a label, and should sit inside a `Tooltip`. */
export function IconButton({
  label,
  icon,
  variant = "quiet",
  size = "sm",
  disabled = false,
  loading = false,
  type = "button",
  className,
  onClick,
  ...props
}: IconButtonProps) {
  return (
    <button
      type={type}
      aria-label={label}
      aria-disabled={disabled || undefined}
      aria-busy={loading || undefined}
      className={cx(base(variant), iconSizes[size], className)}
      onClick={guardClick(disabled || loading, onClick)}
      {...props}
    >
      {loading ? <SpinnerIcon /> : icon}
    </button>
  );
}
