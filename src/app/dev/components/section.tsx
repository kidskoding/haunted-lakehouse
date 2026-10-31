import type { ReactNode } from "react";
import { cx } from "@/components/ui/cx";

interface SectionProps {
  readonly id: string;
  readonly title: string;
  readonly children: ReactNode;
  readonly intro?: ReactNode;
}

/** One component's chapter in the gallery; `id` is also its anchor in the contents. */
export function Section({ id, title, intro, children }: SectionProps) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="flex scroll-mt-12 flex-col gap-6">
      <header className="flex max-w-reading flex-col gap-2">
        <h2 id={`${id}-title`} className="text-balance text-parchment type-heading">
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
    <figure className={cx("flex min-w-0 flex-col gap-3", className)}>
      <figcaption className="text-smoke type-ui-s">{label}</figcaption>
      {children}
    </figure>
  );
}
