import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { deathFromQuery, tombstonePaths, tombstoneQuery } from "@/server/narrative/tombstone-link";
import { tombstone, type Death } from "@/server/narrative/tombstones";
import { Gallery, type DeathSpecimen } from "./gallery";

export const metadata: Metadata = {
  title: "Death",
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

const deaths: readonly { id: string; title: string; death: Death }[] = [
  { id: "early", title: "Early death", death: base },
  {
    id: "boss",
    title: "Act I boss",
    death: {
      ...base,
      handle: "kidskoding",
      character: "night_clerk",
      seed: "wraith-toffee-7",
      slot: 3,
      puzzleId: "possessed-feed",
      failedCheckpoint: { label: "19:45" },
    },
  },
  {
    id: "long",
    title: "Long names",
    death: {
      ...base,
      handle: "a-very-long-github-login-for-a-stone-39",
      character: "purist",
      seed: "specter-candycorn-99",
      slot: 2,
      puzzleId: "thirteenth-door",
      failedCheckpoint: { label: "19:15" },
    },
  },
  {
    id: "daily",
    title: "Daily Haunt",
    death: { ...base, seed: "lantern-marzipan-31", daily: true },
  },
  {
    id: "old-wren",
    title: "Old Wren",
    death: { ...base, character: "old_wren", slot: 3, puzzleId: "possessed-feed" },
  },
  {
    id: "hollow",
    title: "Act III, the Hollow named",
    death: {
      ...base,
      slot: 10,
      act: 3,
      puzzleId: "seance",
      failedCheckpoint: { label: "02:40" },
      progress: { runsFinished: 4, endingsSeen: ["act-1", "act-2"], pagesHeld: [] },
    },
  },
];

/**
 * Development-only proving ground for the death moment; production builds answer 404. The
 * stones are engraved here, on the server, the way the run screen will engrave them.
 */
export default function DeathDevPage() {
  if (process.env.NODE_ENV === "production") notFound();

  const specimens: DeathSpecimen[] = deaths.map(({ id, title, death }) => {
    const paths = tombstonePaths(death);
    // A share card exists only for an hour a run can play today.
    const shareable = deathFromQuery(new URLSearchParams(tombstoneQuery(death))) !== null;
    return {
      id,
      title,
      stone: tombstone(death),
      sharePath: paths.share,
      imagePath: shareable ? paths.image : null,
    };
  });
  return <Gallery specimens={specimens} />;
}
