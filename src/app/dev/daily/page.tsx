import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { DailyHaunt, type DailyHauntProps } from "@/components/crypt/daily-haunt";
import type { DailyBoard, LeaderboardRow } from "@/lib/crypt/daily";
import { dailyToday } from "@/server/daily/daily";

export const metadata: Metadata = {
  title: "Daily Haunt",
  robots: { index: false, follow: false },
};

// A fixed moment, so every specimen shows the same seed and wait.
const TODAY = dailyToday(new Date("2026-10-31T17:48:00Z"));

const row = (
  rank: number,
  handle: string | null,
  slotsCleared: number,
  candlesLeft: number,
  you = false,
): LeaderboardRow => ({ rank, handle, slotsCleared, candlesLeft, you });

const BOARD: DailyBoard = {
  rows: [
    row(1, "marisol-counts", 10, 2),
    row(2, null, 10, 0),
    row(3, "wren", 7, 1),
    row(3, "thorne", 7, 1),
    row(5, "a-very-long-github-handle-indeed", 5, 3),
    row(6, null, 4, 2),
    row(7, "pumpkinpatch", 3, 1),
    row(8, null, 2, 0),
  ],
  total: 8,
};

// The caller's own night, sixth, once they've finished.
const WITH_YOU: DailyBoard = {
  ...BOARD,
  rows: BOARD.rows.map((r) => (r.rank === 6 ? { ...r, you: true } : r)),
};

const CAPPED: DailyBoard = {
  rows: Array.from({ length: 50 }, (_, i) =>
    row(
      i + 1,
      i % 3 === 0 ? null : `hire-${String(i + 1)}`,
      Math.max(0, 10 - Math.floor(i / 5)),
      4 - (i % 5),
    ),
  ),
  total: 212,
};

const EMPTY: DailyBoard = { rows: [], total: 0 };

const STATES: Readonly<Record<string, DailyHauntProps["standing"]>> = {
  fresh: { attempt: { kind: "none" }, board: BOARD },
  empty: { attempt: { kind: "none" }, board: EMPTY },
  "in-progress": { attempt: { kind: "in-progress" }, board: BOARD },
  finished: {
    attempt: { kind: "finished", result: { slotsCleared: 4, candlesLeft: 2, rank: 6 } },
    board: WITH_YOU,
  },
  "no-result": { attempt: { kind: "finished", result: null }, board: BOARD },
  capped: { attempt: { kind: "none" }, board: CAPPED },
  loading: "loading",
  unavailable: null,
};

/** Development-only proving ground for the Daily Haunt; production builds answer 404. */
export default async function DailyDevPage({
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
            href={`/dev/daily?state=${name}`}
            aria-current={name === state ? "page" : undefined}
            className="text-ash type-ui aria-[current=page]:text-flame"
          >
            {name}
          </Link>
        ))}
      </nav>
      <DailyHaunt today={TODAY} standing={STATES[state] ?? null} />
    </>
  );
}
