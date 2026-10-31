import type { ReactNode } from "react";
import { cx } from "@/components/ui/cx";

interface SectionProps {
  readonly id: string;
  readonly eyebrow: string;
  readonly title: string;
  readonly children: ReactNode;
  readonly intro?: ReactNode;
}

/** One component's chapter in the gallery. */
export function Section({ id, eyebrow, title, intro, children }: SectionProps) {
  return (
    <section aria-labelledby={id} className="flex flex-col gap-6 border-t border-line-faint pt-10">
      <header className="flex max-w-reading flex-col gap-2">
        <p className="text-smoke type-label-caps">{eyebrow}</p>
        <h2 id={id} className="text-balance text-parchment type-display-m">
          {title}
        </h2>
        {intro ? <p className="text-pretty text-ash type-prose-s">{intro}</p> : null}
      </header>
      {children}
    </section>
  );
}

/** A labelled specimen tile. */
export function Specimen({
  label,
  children,
  className,
}: {
  readonly label: string;
  readonly children: ReactNode;
  readonly className?: string;
}) {
  return (
    <figure className={cx("flex flex-col gap-3", className)}>
      <figcaption className="text-smoke type-ui-s">{label}</figcaption>
      {children}
    </figure>
  );
}
