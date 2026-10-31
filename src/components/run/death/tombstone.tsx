import type { TombstoneView } from "@/lib/run/tombstone";
import { cx } from "@/components/ui/cx";

export interface TombstoneProps {
  readonly stone: TombstoneView;
  readonly className?: string;
}

/**
 * A dead run's stone: who, as what, when the last candle went out, the epitaph, and the hour
 * and seed it fell on. A stone is a lifted surface, so it stands in `raised` on the dark.
 */
export function Tombstone({ stone, className }: TombstoneProps) {
  return (
    <div
      role="group"
      aria-label={`Tombstone of ${stone.handle}`}
      className={cx(
        "flex w-full max-w-100 flex-col items-center rounded-tomb bg-raised px-8 pt-24 pb-10",
        "text-center",
        className,
      )}
    >
      <p className="text-balance text-parchment type-display-m">{stone.handle}</p>
      <p className="mt-1 text-ash type-ui-l font-normal">{stone.characterTitle}</p>
      <p className="mt-6 text-pretty text-ash type-prose-s">{stone.wentOut}</p>
      {stone.hollowYear ? <p className="text-hollow type-ui">1891</p> : null}
      <p className="mt-8 text-pretty text-parchment type-heading">{stone.epitaph}</p>
      <p className="mt-10 text-ash type-ui">{stone.hour}</p>
      <p className="mt-1 break-all text-smoke type-data">{stone.seed}</p>
    </div>
  );
}
