import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Graveyard } from "@/components/crypt/graveyard";
import { EVERY_STONE, type GraveyardFilter, type GraveyardPage } from "@/lib/crypt/graveyard";
import { replaySeedHref } from "@/lib/run/tombstone";
import { GRAVEYARD_CHARACTERS, GRAVEYARD_HOURS } from "@/server/crypt/graveyard";
import { tombstonePaths } from "@/server/narrative/tombstone-link";
import { tombstone, type Death } from "@/server/narrative/tombstones";

export const metadata: Metadata = {
  title: "Graveyard",
  robots: { index: false, follow: false },
};

const base: Death = {
  handle: null,
  character: "intern",
  seed: "raven-pumpkin-13",
  slot: 1,
  act: 1,
  puzzleId: "porch-lights",
  failedCheckpoint: { label: "18:30" },
  daily: false,
  progress: { runsFinished: 0, endingsSeen: [], pagesHeld: [] },
};

const deaths: readonly Death[] = [
  {
    ...base,
    handle: "kidskoding",
    character: "night_clerk",
    seed: "wraith-toffee-7",
    slot: 3,
    puzzleId: "possessed-feed",
    failedCheckpoint: { label: "20:00" },
  },
  base,
  {
    ...base,
    handle: "a-very-long-github-login-for-a-stone-39",
    character: "purist",
    seed: "specter-candycorn-99",
    slot: 2,
    puzzleId: "thirteenth-door",
    failedCheckpoint: { label: "19:15" },
  },
  { ...base, seed: "lantern-marzipan-31", daily: true },
  {
    ...base,
    handle: "wrenfan",
    character: "old_wren",
    slot: 3,
    puzzleId: "possessed-feed",
    failedCheckpoint: { label: "19:50" },
  },
  { ...base, handle: "moth", seed: "cauldron-nougat-4", failedCheckpoint: { label: "18:45" } },
];

const stones: GraveyardPage = {
  stones: deaths.map((death) => ({
    stone: tombstone(death),
    sharePath: tombstonePaths(death).share,
    replayPath: replaySeedHref(death.seed),
  })),
  hasMore: true,
};

const STATES: Readonly<Record<string, { filter: GraveyardFilter; page: GraveyardPage | null }>> = {
  stones: { filter: EVERY_STONE, page: stones },
  "page-two": { filter: { ...EVERY_STONE, character: "purist", page: 2 }, page: stones },
  bare: { filter: EVERY_STONE, page: { stones: [], hasMore: false } },
  "no-match": {
    filter: { ...EVERY_STONE, hour: "thirteenth-door", daily: true },
    page: { stones: [], hasMore: false },
  },
  error: { filter: EVERY_STONE, page: null },
};

/** Development-only proving ground for the Graveyard; production builds answer 404. */
export default async function GraveyardDevPage({
  searchParams,
}: {
  searchParams: Promise<{ state?: string }>;
}) {
  if (process.env.NODE_ENV === "production") notFound();

  const { state = "stones" } = await searchParams;
  const specimen = Object.hasOwn(STATES, state) ? STATES[state] : undefined;
  if (specimen === undefined) notFound();
  return (
    <>
      <nav aria-label="Specimen states" className="flex flex-wrap gap-3 px-4 pt-4 md:px-8">
        {Object.keys(STATES).map((name) => (
          <Link
            key={name}
            href={`/dev/graveyard?state=${name}`}
            aria-current={name === state ? "page" : undefined}
            className="text-ash type-ui aria-[current=page]:text-flame"
          >
            {name}
          </Link>
        ))}
      </nav>
      <Graveyard
        filter={specimen.filter}
        options={{ characters: GRAVEYARD_CHARACTERS, hours: GRAVEYARD_HOURS }}
        page={specimen.page}
      />
    </>
  );
}
