import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Ledger } from "@/components/crypt/ledger";
import { ledgerView } from "@/server/ledger/ledger";
import { PAGE_IDS, type PageId } from "@/server/narrative/progress";

export const metadata: Metadata = {
  title: "Ledger",
  robots: { index: false, follow: false },
};

const STATES: Readonly<Record<string, readonly PageId[] | null>> = {
  none: [],
  some: ["page-1", "page-3", "page-6"],
  all: PAGE_IDS,
  unavailable: null,
};

/** Development-only proving ground for the Ledger; production builds answer 404. */
export default async function LedgerDevPage({
  searchParams,
}: {
  searchParams: Promise<{ state?: string }>;
}) {
  if (process.env.NODE_ENV === "production") notFound();

  const { state = "none" } = await searchParams;
  if (!Object.hasOwn(STATES, state)) notFound();
  const pages = STATES[state] ?? null;
  return (
    <>
      <nav aria-label="Specimen states" className="flex flex-wrap gap-3 px-4 pt-4 md:px-8">
        {Object.keys(STATES).map((name) => (
          <Link
            key={name}
            href={`/dev/ledger?state=${name}`}
            aria-current={name === state ? "page" : undefined}
            className="text-ash type-ui aria-[current=page]:text-flame"
          >
            {name}
          </Link>
        ))}
      </nav>
      <Ledger ledger={pages ? ledgerView(pages, []) : null} />
    </>
  );
}
