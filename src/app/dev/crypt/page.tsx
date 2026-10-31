import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CryptHub } from "@/components/crypt/hub";
import type { CryptCounts } from "@/lib/crypt/destinations";

export const metadata: Metadata = {
  title: "Crypt hub",
  robots: { index: false, follow: false },
};

const STATES: Readonly<Record<string, CryptCounts | null>> = {
  fresh: {
    autopsies: { held: 0, total: 3 },
    characters: { held: 1, total: 4 },
    pages: { held: 0, total: 7 },
  },
  midway: {
    autopsies: { held: 2, total: 3 },
    characters: { held: 2, total: 4 },
    pages: { held: 3, total: 7 },
  },
  complete: {
    autopsies: { held: 3, total: 3 },
    characters: { held: 4, total: 4 },
    pages: { held: 7, total: 7 },
  },
  unavailable: null,
};

/** Development-only proving ground for the Crypt hub; production builds answer 404. */
export default async function CryptDevPage({
  searchParams,
}: {
  searchParams: Promise<{ state?: string }>;
}) {
  if (process.env.NODE_ENV === "production") notFound();

  const { state = "fresh" } = await searchParams;
  if (!Object.hasOwn(STATES, state)) notFound();
  return (
    <>
      <nav aria-label="Specimen states" className="flex flex-wrap gap-3 px-4 pt-4 md:px-8">
        {Object.keys(STATES).map((name) => (
          <Link
            key={name}
            href={`/dev/crypt?state=${name}`}
            aria-current={name === state ? "page" : undefined}
            className="text-ash type-ui aria-[current=page]:text-flame"
          >
            {name}
          </Link>
        ))}
      </nav>
      <CryptHub counts={STATES[state] ?? null} />
    </>
  );
}
