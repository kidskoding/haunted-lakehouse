import Link from "next/link";
import { AutopsySections } from "@/components/run/hour-cleared/autopsy-sections";
import { StoryText } from "@/components/run/story/story-text";
import { buttonClassName } from "@/components/ui/button-styles";
import { ChevronIcon } from "@/components/ui/icons";
import type { CodexEntry, LockedEntry, WrittenEntry } from "@/lib/crypt/codex";
import { tallyLine } from "@/lib/crypt/destinations";

export interface CodexProps {
  /** Every hour's page, in the order of the night, or null when the Codex couldn't be read. */
  readonly entries: readonly CodexEntry[] | null;
}

function HourLine({ entry }: { readonly entry: CodexEntry }) {
  const written = entry.kind === "written";
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
      <h2 className={written ? "text-parchment type-display-m" : "text-smoke type-heading"}>
        {entry.title}
        {written ? null : <span className="sr-only">, not yet written</span>}
      </h2>
      <span className="text-smoke type-data">{entry.time}</span>
    </div>
  );
}

function Written({ entry }: { readonly entry: WrittenEntry }) {
  return (
    <li className="flex flex-col gap-4">
      <HourLine entry={entry} />
      {/* A native disclosure: it opens from the keyboard and works before any script runs. */}
      <details className="group rounded-m bg-panel">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-4 rounded-m px-5 py-4 transition-colors duration-fast ease-out ui-hover:bg-raised sm:px-8 [&::-webkit-details-marker]:hidden">
          <span className="text-balance text-parchment type-ui-l">
            <StoryText segments={entry.autopsy.title} voiced={false} />
          </span>
          <ChevronIcon className="size-5 shrink-0 text-ash transition-transform duration-fast group-open:rotate-90 motion-calm:transition-none" />
        </summary>
        <article
          aria-label={`What really happened in ${entry.title}`}
          className="flex max-w-reading flex-col gap-7 px-5 pt-3 pb-8 sm:px-8"
        >
          <p className="text-smoke type-data">From the night of {entry.seed}</p>
          <AutopsySections autopsy={entry.autopsy} level="h3" />
        </article>
      </details>
    </li>
  );
}

function Locked({ entry }: { readonly entry: LockedEntry }) {
  return (
    <li>
      <HourLine entry={entry} />
    </li>
  );
}

/**
 * The Codex: the player's earned autopsies, one page per hour, in the order of the night. An
 * hour not yet cleared shows only its name and time. Server-renderable; it needs no script.
 */
export function Codex({ entries }: CodexProps) {
  const written = entries?.filter((entry) => entry.kind === "written").length ?? 0;
  return (
    <main className="mx-auto grid min-h-dvh w-full max-w-page content-start gap-y-12 px-4 py-16 md:px-8 md:py-24 lg:grid-cols-12 lg:gap-x-8">
      <header className="flex flex-col gap-5 lg:sticky lg:top-24 lg:col-span-4 lg:self-start">
        <h1 className="text-balance text-parchment type-display-l">The Codex</h1>
        <p className="max-w-copy text-pretty text-ash type-prose">
          {written === 0
            ? "Wren files an autopsy for every hour you clear. Clear one, and its page fills in here."
            : "Wren files an autopsy for every hour you clear, written in the numbers of your own night."}
        </p>
        {entries ? (
          <p className="text-smoke type-data">
            {tallyLine("autopsies", { held: written, total: entries.length })}
          </p>
        ) : null}
        <Link href="/crypt" className={`${buttonClassName("ghost", "md")} mt-3 self-start`}>
          Back to the Crypt
        </Link>
      </header>
      <section aria-label="Autopsies" className="lg:col-span-8">
        {entries ? (
          <ol className="flex flex-col gap-10">
            {entries.map((entry) =>
              entry.kind === "written" ? (
                <Written key={entry.puzzleId} entry={entry} />
              ) : (
                <Locked key={entry.puzzleId} entry={entry} />
              ),
            )}
          </ol>
        ) : (
          <p role="status" className="max-w-copy text-pretty text-ash type-prose">
            Wren can&rsquo;t find the Codex tonight. Your autopsies are safe; come back in a little
            while.
          </p>
        )}
      </section>
    </main>
  );
}
