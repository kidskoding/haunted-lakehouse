import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Codex } from "@/components/crypt/codex";
import { codexEntries } from "@/server/codex/codex";
import type { EarnedClear } from "@/server/codex/earned";

export const metadata: Metadata = {
  title: "Codex",
  robots: { index: false, follow: false },
};

const PORCH: EarnedClear = {
  puzzleId: "porch-lights",
  seed: "raven-pumpkin-13",
  character: "intern",
  curse: null,
  candles: 4,
};

const STATES: Readonly<Record<string, readonly EarnedClear[] | null>> = {
  empty: [],
  some: [PORCH],
  all: [
    PORCH,
    { ...PORCH, puzzleId: "thirteenth-door", seed: "moth-lantern-7", curse: "fog", candles: 3 },
    { ...PORCH, puzzleId: "possessed-feed", seed: "moth-lantern-7", curse: "possession" },
  ],
  unavailable: null,
};

/** Development-only proving ground for the Codex; production builds answer 404. */
export default async function CodexDevPage({
  searchParams,
}: {
  searchParams: Promise<{ state?: string }>;
}) {
  if (process.env.NODE_ENV === "production") notFound();

  const { state = "empty" } = await searchParams;
  if (!Object.hasOwn(STATES, state)) notFound();
  const earned = STATES[state] ?? null;
  return (
    <>
      <nav aria-label="Specimen states" className="flex flex-wrap gap-3 px-4 pt-4 md:px-8">
        {Object.keys(STATES).map((name) => (
          <Link
            key={name}
            href={`/dev/codex?state=${name}`}
            aria-current={name === state ? "page" : undefined}
            className="text-ash type-ui aria-[current=page]:text-flame"
          >
            {name}
          </Link>
        ))}
      </nav>
      <Codex entries={earned ? codexEntries(earned) : null} />
    </>
  );
}
