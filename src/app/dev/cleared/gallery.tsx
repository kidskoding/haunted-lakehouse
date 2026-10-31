"use client";

import Link from "next/link";
import { useState } from "react";
import { HourCleared } from "@/components/run/hour-cleared";
import { Button } from "@/components/ui/button";
import { cx } from "@/components/ui/cx";
import type { RelicKind } from "@/lib/run/bottom-bar";
import type { ClearedFixture } from "./fixtures";

export function Gallery({
  fixtures,
  current,
}: {
  readonly fixtures: readonly ClearedFixture[];
  readonly current: ClearedFixture;
}) {
  const { id, props } = current;
  // Undefined while the moment plays; then the relic taken, or null for none.
  const [result, setResult] = useState<RelicKind | null | undefined>(undefined);
  const [replays, setReplays] = useState(0);
  const taken = props.offer.find((relic) => relic.kind === result);

  return (
    <main className="mx-auto flex min-h-dvh max-w-page flex-col gap-8 px-8 py-12">
      <header className="flex flex-col gap-4">
        <h1 className="text-parchment type-display-m">Hour cleared</h1>
        <nav aria-label="Fixtures">
          <ul className="flex flex-wrap gap-2">
            {fixtures.map((fixture) => (
              <li key={fixture.id}>
                <Link
                  href={`/dev/cleared?fixture=${fixture.id}`}
                  aria-current={fixture.id === id ? "page" : undefined}
                  className={cx(
                    "block rounded-xs px-3 py-1.5 type-ui transition-colors duration-instant",
                    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-glow",
                    fixture.id === id
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

      {result === undefined ? (
        <HourCleared
          key={`${id}-${String(replays)}`}
          {...props}
          onFinish={(relic) => {
            setResult(relic);
          }}
        />
      ) : (
        <div className="flex flex-col items-start gap-4">
          <p role="status" className="text-parchment type-prose">
            {taken ? `Took ${taken.name}.` : "Took nothing. On into the next hour."}
          </p>
          <Button
            variant="ghost"
            size="md"
            onClick={() => {
              setResult(undefined);
              setReplays(replays + 1);
            }}
          >
            Play it again
          </Button>
        </div>
      )}
    </main>
  );
}
