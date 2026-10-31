import Link from "next/link";
import { EndingScreen } from "@/components/run/ending";
import { cx } from "@/components/ui/cx";
import type { EndingFixture } from "./fixtures";

export function Gallery({
  fixtures,
  current,
}: {
  readonly fixtures: readonly EndingFixture[];
  readonly current: EndingFixture;
}) {
  return (
    <main className="mx-auto flex min-h-dvh max-w-page flex-col gap-8 px-8 py-12">
      <header className="flex flex-col gap-4">
        <h1 className="text-parchment type-display-m">Endings</h1>
        <nav aria-label="Fixtures">
          <ul className="flex flex-wrap gap-2">
            {fixtures.map((fixture) => (
              <li key={fixture.id}>
                <Link
                  href={`/dev/endings?fixture=${fixture.id}`}
                  aria-current={fixture.id === current.id ? "page" : undefined}
                  className={cx(
                    "block rounded-xs px-3 py-1.5 type-ui transition-colors duration-instant",
                    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-glow",
                    fixture.id === current.id
                      ? "bg-tint-flame font-semibold text-parchment"
                      : "text-ash ui-hover:bg-raised ui-hover:text-parchment",
                  )}
                >
                  {fixture.caption}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </header>
      <EndingScreen {...current.props} />
    </main>
  );
}
