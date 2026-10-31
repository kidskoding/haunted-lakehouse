import type { Metadata } from "next";
import { CharacterSelect } from "@/components/character-select/character-select";
import { characterSelectView } from "@/server/unlocks/character-select";
import { FRESH_UNLOCKS } from "@/server/unlocks/progress";

export const metadata: Metadata = {
  title: "Who takes the night?",
};

// shortcut: every visitor is a new player until unlocks load from Postgres; swap in
// loadPlayerUnlocks for the session's player once the database is provisioned.
export default function NewRunPage() {
  return <CharacterSelect view={characterSelectView(FRESH_UNLOCKS)} />;
}
