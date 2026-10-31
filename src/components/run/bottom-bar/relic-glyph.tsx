import type { ReactNode } from "react";
import type { RelicKind } from "@/lib/run/bottom-bar";
import { cx } from "@/components/ui/cx";

/*
 * One glyph per relic, on the art direction's icon grid (§5.1): 24×24, 1.5px stroke, round
 * caps and joins, `currentColor`, and a solid shape only for a flame or falling sand.
 */
const paths: Readonly<Record<RelicKind, ReactNode>> = {
  "wrens-lantern": (
    <>
      <path d="M10 5.5a2 2 0 1 1 4 0" />
      <path d="M8.25 7.5h7.5M9 7.5v10M15 7.5v10M7.5 17.5h9l-1 2.5h-7z" />
      <path
        d="M12 10.25c1.1 1.35 1.6 2.25 1.6 3a1.6 1.6 0 0 1-3.2 0c0-.75.5-1.65 1.6-3Z"
        fill="currentColor"
        stroke="none"
      />
    </>
  ),
  "ravens-feather": (
    <>
      <path d="M19 4c-7 .5-11.5 5.5-12.5 13" />
      <path d="M19 4c.75 6.5-4.25 11.75-12.5 13" />
      <path d="M11 13.5l3-1.25M9.5 10.5l2.75-.5" />
      <path d="M6.5 17 4.5 20" />
    </>
  ),
  hourglass: (
    <>
      <path d="M6.5 3.5h11M6.5 20.5h11" />
      <path d="M8 3.5c0 4.5 4 5 4 8.5s-4 4-4 8.5M16 3.5c0 4.5-4 5-4 8.5s4 4 4 8.5" />
      <path d="M9.75 19.25h4.5L12 16.75z" fill="currentColor" stroke="none" />
    </>
  ),
  "black-cat": (
    <>
      <path d="M8.5 10.5V4.75l2.5 2.5h2l2.5-2.5v5.75a3.5 3.5 0 0 1-7 0Z" />
      <path d="M9.75 13.5 8 20.25h8l-1.75-6.75" />
      <path d="M16 20.25c2.25 0 3.5-1.25 3.5-3.25" />
    </>
  ),
  "spare-candle": (
    <>
      <path d="M9 9.5h2.25l.75 1 .75-1H15V20H9zM7 20h10" />
      <path d="M12 9.5V6.75" />
    </>
  ),
};

/** The relic's mark. Always decorative: the control around it carries the relic's name. */
export function RelicGlyph({ kind, className }: { kind: RelicKind; className?: string }) {
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
      className={cx("size-5 shrink-0", className)}
    >
      {paths[kind]}
    </svg>
  );
}
