import { cx } from "./cx";

/*
 * Variants follow the art direction's controls table (§5.6). Filled variants hand `night` to
 * any keycap inside them; a disabled filled button turns `fog` and its keycap goes back to
 * the quiet ink.
 */
const variants = {
  /** The one lit action on a screen: "Run the night", "Enter the night". */
  primary:
    "bg-flame text-night ui-hover:bg-ember ui-active:bg-ember ui-active:translate-y-px " +
    "[--kbd-ink:var(--color-night)] [--kbd-line:var(--color-night)]",
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
  "aria-disabled:bg-fog aria-disabled:text-ash " +
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

export const sizes = {
  /** 40px: primary and run buttons. */
  lg: "h-10 gap-2 px-4 type-ui-l",
  /** 32px: the default. */
  md: "h-8 gap-2 px-3 type-ui font-semibold",
  /** 28px: panel actions. */
  sm: "h-7 gap-1.5 px-2 type-ui font-semibold",
} as const;

export const iconSizes = { lg: "size-10", md: "size-8", sm: "size-7" } as const;

export type ButtonVariant = keyof typeof variants;
export type ButtonSize = keyof typeof sizes;

/** The classes every variant shares, plus the variant's own. */
export function base(variant: ButtonVariant) {
  return cx(
    "relative inline-flex shrink-0 cursor-pointer select-none items-center justify-center",
    "whitespace-nowrap rounded-xs transition-[background-color,color,box-shadow,translate]",
    "duration-instant ease-out aria-disabled:cursor-not-allowed aria-busy:cursor-progress",
    variants[variant],
    disabledStyles[variant],
  );
}

/** A button's look for a link that navigates, such as "Enter the night". */
export function buttonClassName(variant: ButtonVariant = "ghost", size: ButtonSize = "md"): string {
  return cx(base(variant), sizes[size]);
}
