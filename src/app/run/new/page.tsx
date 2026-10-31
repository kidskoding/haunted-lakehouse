import type { Metadata } from "next";
import { CharacterSelect } from "@/components/character-select/character-select";
import { db } from "@/server/db/client";
import { isHumanSeed } from "@/server/engine/seed";
import { currentPlayerId } from "@/server/session/session";
import { characterSelectView } from "@/server/unlocks/character-select";
import { FRESH_UNLOCKS } from "@/server/unlocks/progress";
import { loadPlayerUnlocks } from "@/server/unlocks/store";

export const metadata: Metadata = {
  title: "Who takes the night?",
};

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/**
 * The character select; `?seed=` (Replay seed) rides along so the run replays that night, and
 * `?daily=1` marks it as today's Daily Haunt.
 */
export default async function NewRunPage({
  searchParams,
}: {
  readonly searchParams: SearchParams;
}) {
  const { seed, daily } = await searchParams;
  const playerId = await currentPlayerId();
  const unlocks = playerId ? await loadPlayerUnlocks(await db(), playerId) : FRESH_UNLOCKS;
  return (
    <CharacterSelect
      view={characterSelectView(unlocks)}
      seed={typeof seed === "string" && isHumanSeed(seed) ? seed : null}
      daily={daily === "1"}
    />
  );
}
