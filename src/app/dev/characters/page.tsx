import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CharacterSelect } from "@/components/character-select/character-select";
import { PAGE_IDS } from "@/server/narrative/progress";
import { characterSelectView } from "@/server/unlocks/character-select";
import { applyAwards, awardsForBossClear, FRESH_UNLOCKS } from "@/server/unlocks/progress";

export const metadata: Metadata = {
  title: "Character select",
  robots: { index: false, follow: false },
};

/** Both act bosses cleared: three characters open, Old Wren still a secret. */
const MIDGAME = applyAwards(FRESH_UNLOCKS, [
  ...awardsForBossClear("act-1", []),
  ...awardsForBossClear("act-2", []),
]);

/** The true ending seen with every page held: the whole cast. */
const COMPLETE = applyAwards(MIDGAME, awardsForBossClear("act-3", PAGE_IDS), PAGE_IDS);

/**
 * Development-only proving ground for the character select at later unlock states;
 * `?progress=complete` opens the whole cast. Production builds answer 404.
 */
export default async function CharactersDevPage({
  searchParams,
}: {
  readonly searchParams: Promise<{ progress?: string | string[] }>;
}) {
  if (process.env.NODE_ENV === "production") notFound();
  const { progress } = await searchParams;
  return (
    <CharacterSelect view={characterSelectView(progress === "complete" ? COMPLETE : MIDGAME)} />
  );
}
