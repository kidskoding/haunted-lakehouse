import Link from "next/link";
import { buttonClassName } from "@/components/ui/button-styles";
import { cx } from "@/components/ui/cx";
import { CRYPT_DESTINATIONS, type CryptCounts, tallyLine } from "@/lib/crypt/destinations";

export interface CryptHubProps {
  /** The player's counts, or null when they couldn't be read (the numbers are then left out). */
  readonly counts: CryptCounts | null;
}

/**
 * The hub between runs: a typographic list of the Crypt's five rooms, each a link to its own
 * page. Server-renderable; it works before any script runs.
 */
export function CryptHub({ counts }: CryptHubProps) {
  return (
    <main className="mx-auto grid min-h-dvh w-full max-w-page content-start gap-y-12 px-4 py-16 md:px-8 md:py-24 lg:grid-cols-12 lg:gap-x-8">
      <header className="flex flex-col gap-5 lg:sticky lg:top-24 lg:col-span-5 lg:self-start">
        <h1 className="text-balance text-parchment type-display-l">The Crypt</h1>
        <p className="max-w-copy text-pretty text-ash type-prose">
          Under the boathouse, the town keeps what each night leaves behind. Wren holds the key, and
          she doesn&rsquo;t ask why you&rsquo;ve come down.
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <Link href="/run/new" className={buttonClassName("primary", "lg")}>
            Enter the night
          </Link>
          <Link href="/" className={buttonClassName("ghost", "lg")}>
            Back to Hollow Creek
          </Link>
        </div>
      </header>
      <nav aria-label="Rooms of the Crypt" className="lg:col-span-7">
        <ul className="flex flex-col gap-2">
          {CRYPT_DESTINATIONS.map(({ id, name, href, line, count }) => {
            const tally = count && counts ? tallyLine(count, counts[count]) : null;
            return (
              <li key={id}>
                <Link
                  href={href}
                  className="-mx-3 flex flex-col gap-1.5 rounded-xs px-3 py-4 transition-colors duration-fast ease-out ui-hover:bg-raised md:-mx-4 md:px-4"
                >
                  <span className="text-balance text-parchment type-display-m">{name}</span>
                  <span className="max-w-reading text-pretty text-ash type-prose-s">{line}</span>
                  {tally ? (
                    <span
                      className={cx(
                        "type-data",
                        // Ledger pages are the Hollow's; everything else is quiet metadata.
                        id === "ledger" ? "text-hollow" : "text-smoke",
                      )}
                    >
                      {tally}
                    </span>
                  ) : null}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </main>
  );
}
