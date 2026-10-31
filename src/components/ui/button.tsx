"use client";

import type { ComponentPropsWithRef, MouseEvent, ReactNode } from "react";
import { cx } from "./cx";
import { SpinnerIcon } from "./icons";

/*
 * Variants follow the art direction's controls table (§5.6). Filled variants hand `night` to
 * any keycap inside them; a disabled filled button turns `fog` and its keycap goes back to
 * the quiet ink.
 */
const variants = {
  /** The one lit action on a screen: "Run the night", "Enter the night". */
  primary:
    "bg-flame text-night shadow-glow-primary ui-hover:bg-ember ui-active:bg-ember " +
    "ui-active:translate-y-px ui-active:shadow-none [--kbd-ink:var(--color-night)] " +
    "[--kbd-line:var(--color-night)]",
  /** A strong action that is not the night's: "Preview". */
  secondary:
    "bg-parchment text-night ui-hover:bg-glow ui-active:bg-ash ui-active:translate-y-px " +
    "[--kbd-ink:var(--color-night)] [--kbd-line:var(--color-night)]",
  /** Toolbar actions. */
  ghost:
    "border border-line-control text-ash ui-hover:bg-raised ui-hover:text-parchment " +
    "ui-active:bg-fog ui-active:text-parchment",
  /** Icon-only header actions; no border until hovered. */
  quiet: "text-ash ui-hover:bg-raised ui-hover:text-parchment ui-active:bg-fog",
  /** Opens a destructive confirm: "Abandon run". */
  destructive:
    "border border-line-control text-snuffed ui-hover:bg-tint-snuffed ui-active:bg-tint-snuffed " +
    "ui-active:translate-y-px",
  /** The confirm inside a destructive dialog. */
  "destructive-confirm":
    "bg-snuffed text-night ui-hover:bg-snuffed/85 ui-active:bg-snuffed/85 ui-active:translate-y-px " +
    "[--kbd-ink:var(--color-night)] [--kbd-line:var(--color-night)]",
} as const;

/* Every disabled variant reads the same: present, legible, plainly unavailable. */
const disabledFilled =
  "aria-disabled:bg-fog aria-disabled:text-ash aria-disabled:shadow-none " +
  "aria-disabled:[--kbd-ink:var(--color-ash)] aria-disabled:[--kbd-line:var(--color-line-control)]";
const disabledOutlined = "aria-disabled:border-line-strong aria-disabled:text-smoke";
const disabledQuiet = "aria-disabled:text-smoke";

const disabledStyles: Readonly<Record<ButtonVariant, string>> = {
  primary: disabledFilled,
  secondary: disabledFilled,
  "destructive-confirm": disabledFilled,
  ghost: disabledOutlined,
  destructive: disabledOutlined,
  quiet: disabledQuiet,
};

const sizes = {
  /** 40px: primary and run buttons. */
  lg: "h-10 gap-2 px-4 type-ui-l",
  /** 32px: the default. */
  md: "h-8 gap-2 px-3 type-ui font-semibold",
  /** 28px: panel actions. */
  sm: "h-7 gap-1.5 px-2 type-ui font-semibold",
} as const;

const iconSizes = { lg: "size-10", md: "size-8", sm: "size-7" } as const;

export type ButtonVariant = keyof typeof variants;
export type ButtonSize = keyof typeof sizes;

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

function base(variant: ButtonVariant) {
  return cx(
    "relative inline-flex shrink-0 cursor-pointer select-none items-center justify-center",
    "whitespace-nowrap rounded-xs transition-[background-color,color,box-shadow,translate]",
    "duration-instant ease-out aria-disabled:cursor-not-allowed aria-busy:cursor-progress",
    variants[variant],
    disabledStyles[variant],
  );
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
