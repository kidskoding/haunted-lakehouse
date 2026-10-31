import Link from "next/link";
import type { CSSProperties } from "react";
import { StoryScene } from "@/components/run/story";
import { StoryText } from "@/components/run/story/story-text";
import { buttonClassName } from "@/components/ui/button-styles";
import { cx } from "@/components/ui/cx";
import { tallyLine } from "@/lib/crypt/destinations";
import type { FoundLeaf, LedgerLeaf, LedgerView, TornLeaf } from "@/lib/crypt/ledger";

export interface LedgerProps {
  /** The player's Ledger, or null when it couldn't be read. */
  readonly ledger: LedgerView | null;
}

// Fixed, uneven tears along the top and bottom, so a gap reads as ripped out, not as a pattern.
const TORN_EDGE: CSSProperties = {
  clipPath: [
    "polygon(0% 4%, 4% 16%, 9% 6%, 13% 20%, 18% 9%, 24% 14%, 29% 3%, 35% 18%, 40% 8%, 46% 22%,",
    "51% 10%, 57% 15%, 62% 4%, 68% 19%, 73% 7%, 79% 13%, 84% 2%, 90% 17%, 95% 8%, 100% 12%,",
    "100% 90%, 96% 80%, 91% 95%, 86% 84%, 80% 98%, 75% 86%, 69% 93%, 64% 79%, 58% 92%, 53% 85%,",
    "47% 99%, 42% 82%, 36% 94%, 31% 87%, 25% 97%, 20% 81%, 14% 91%, 9% 84%, 4% 96%, 0% 88%)",
  ].join(" "),
};

// On a phone the numeral heads its page, leaving the text the whole width. From sm up the
// numerals hang in the book's margin, right-aligned so the pages share one left edge.
const LEAF = "flex flex-col gap-2 sm:grid sm:grid-cols-[4.5rem_minmax(0,1fr)] sm:gap-x-6";
const NUMERAL = "type-display-m sm:text-right";

function Found({ leaf }: { readonly leaf: FoundLeaf }) {
  return (
    <li className={LEAF}>
      <h2 className={cx(NUMERAL, "text-hollow")}>
        <span className="sr-only">Page </span>
        {leaf.page.numeral}
      </h2>
      <p className="max-w-reading text-pretty sm:pt-1 text-parchment type-prose">
        <StoryText segments={leaf.page.segments} voiced={false} />
      </p>
    </li>
  );
}

function Torn({ leaf, index }: { readonly leaf: TornLeaf; readonly index: number }) {
  return (
    <li className={LEAF}>
      <h2 className={cx(NUMERAL, "text-smoke")}>
        <span className="sr-only">Page </span>
        {leaf.numeral}
        <span className="sr-only">, torn out</span>
      </h2>
      <div
        aria-hidden="true"
        style={TORN_EDGE}
        // Mirroring every other gap keeps the tears from lining up like a pattern.
        className={cx(
          "h-14 max-w-reading bg-inset sm:mt-2 sm:h-16",
          index % 2 === 1 && "-scale-x-100",
        )}
      />
    </li>
  );
}

function Leaf({ leaf, index }: { readonly leaf: LedgerLeaf; readonly index: number }) {
  return leaf.kind === "found" ? <Found leaf={leaf} /> : <Torn leaf={leaf} index={index} />;
}

/**
 * The Ledger: the old book's seven torn pages, laid out as one leaf. A found page reads in full;
 * a missing one is a torn gap under its numeral. Server-renderable; it needs no script.
 */
export function Ledger({ ledger }: LedgerProps) {
  const found = ledger?.leaves.filter((leaf) => leaf.kind === "found").length ?? 0;
  return (
    <main className="mx-auto grid min-h-dvh w-full max-w-page content-start gap-y-12 px-4 py-16 md:px-8 md:py-24 lg:grid-cols-12 lg:gap-x-8">
      <header className="flex flex-col gap-5 lg:sticky lg:top-24 lg:col-span-4 lg:self-start">
        <h1 className="text-balance text-parchment type-display-l">The Ledger</h1>
        <p className="max-w-copy text-pretty text-ash type-prose">
          The torn pages of the old book, laid out as you find them.
        </p>
        {ledger ? (
          <p className="text-smoke type-data">
            {tallyLine("pages", { held: found, total: ledger.leaves.length })}
          </p>
        ) : null}
        <Link href="/crypt" className={`${buttonClassName("ghost", "md")} mt-3 self-start`}>
          Back to the Crypt
        </Link>
      </header>
      <section aria-label="Ledger pages" className="flex flex-col gap-12 lg:col-span-8">
        {ledger ? (
          <>
            <ol className="flex flex-col gap-10 rounded-s bg-panel px-4 py-8 sm:gap-12 sm:px-10 sm:py-12">
              {ledger.leaves.map((leaf, index) => (
                <Leaf
                  key={leaf.kind === "found" ? leaf.page.numeral : leaf.numeral}
                  leaf={leaf}
                  index={index}
                />
              ))}
            </ol>
            {ledger.closing ? (
              <div className="flex flex-col gap-6">
                <StoryScene lines={[ledger.closing]} />
                <Link href="/run/new" className={`${buttonClassName("primary", "lg")} self-start`}>
                  Enter the night
                </Link>
              </div>
            ) : null}
          </>
        ) : (
          <p role="status" className="max-w-copy text-pretty text-ash type-prose">
            Wren can&rsquo;t find the Ledger tonight. Your pages are safe; come back in a little
            while.
          </p>
        )}
      </section>
    </main>
  );
}
