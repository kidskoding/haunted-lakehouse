import type { ReactNode, SVGProps } from "react";
import { cx } from "./cx";

/*
 * The handful of glyphs the core components need, drawn on the art direction's icon grid:
 * 24×24 with a 20×20 live area, 1.5px stroke, round caps and joins, and a single solid shape
 * only where the metaphor needs one (a flame). Icons are always decorative here: every use
 * sits next to a text label or inside a control that has one.
 */

type IconProps = Omit<SVGProps<SVGSVGElement>, "children">;

function Glyph({ children, className, ...props }: IconProps & { readonly children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className={className ?? "size-4 shrink-0"}
      {...props}
    >
      {children}
    </svg>
  );
}

export function CloseIcon(props: IconProps) {
  return (
    <Glyph {...props}>
      <path d="M6 6l12 12M18 6 6 18" />
    </Glyph>
  );
}

export function AlertIcon(props: IconProps) {
  return (
    <Glyph {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7.5v5.5" />
      <path d="M12 16.5h.01" />
    </Glyph>
  );
}

/** Points right; a disclosure rotates it a quarter turn to show it is open. */
export function ChevronIcon(props: IconProps) {
  return (
    <Glyph {...props}>
      <path d="m9.5 6 6 6-6 6" />
    </Glyph>
  );
}

/** Info: moonlight. */
export function MoonIcon(props: IconProps) {
  return (
    <Glyph {...props}>
      <path d="M19.5 14.6A8 8 0 0 1 9.4 4.5a8 8 0 1 0 10.1 10.1Z" />
    </Glyph>
  );
}

const candleBody = <path d="M9 11.5h6V20H9zM7 20h10M12 11.5V9.75" />;

/** Success: the candle stays lit. */
export function CandleLitIcon(props: IconProps) {
  return (
    <Glyph {...props}>
      {candleBody}
      <path
        d="M12 2.75c1.6 1.9 2.25 3.15 2.25 4.15A2.25 2.25 0 0 1 12 9.15 2.25 2.25 0 0 1 9.75 6.9c0-1 .65-2.25 2.25-4.15Z"
        fill="currentColor"
        stroke="none"
      />
    </Glyph>
  );
}

/** Warning: the wax is running. A thinner, leaning flame and a drip down the side. */
export function CandleGutteringIcon(props: IconProps) {
  return (
    <Glyph {...props}>
      {candleBody}
      <path d="M15 11.5v3.25a.9.9 0 0 1-1.8 0" />
      <path
        d="M13.4 3.25c.55 1.75.7 3.05.35 4.15a1.6 1.6 0 0 1-3.05.15c-.2-1.05.8-2.4 2.7-4.3Z"
        fill="currentColor"
        stroke="none"
      />
    </Glyph>
  );
}

/** Failure: a candle goes out, leaving a curl of smoke. */
export function CandleSnuffedIcon(props: IconProps) {
  return (
    <Glyph {...props}>
      {candleBody}
      <path d="M12 8.25c-1.35-.9-1.35-2.1 0-3s1.35-2.1 0-3" />
    </Glyph>
  );
}

/** An open arc that turns while work is in flight; it holds still under reduced motion. */
export function SpinnerIcon({ className, ...props }: IconProps) {
  return (
    <Glyph
      className={cx("size-4 shrink-0 animate-spin motion-calm:animate-none", className)}
      {...props}
    >
      <path d="M12 3.75a8.25 8.25 0 1 1-8.25 8.25" />
    </Glyph>
  );
}

/** Copy: one page laid over another. */
export function CopyIcon(props: IconProps) {
  return (
    <Glyph {...props}>
      <path d="M9 9h10v11H9z" />
      <path d="M15 9V4H5v11h4" />
    </Glyph>
  );
}
