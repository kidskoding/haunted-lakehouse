import type { Metadata } from "next";
import { CryptHub } from "@/components/crypt/hub";
import { loadCryptCounts } from "@/server/unlocks/crypt";

export const metadata: Metadata = {
  title: "The Crypt",
  description:
    "Between nights: the Codex, the Graveyard, the Ledger, Characters, and the Daily Haunt.",
};

/** The hub between runs. Its counts come from the caller's session, so it renders per request. */
export default async function CryptPage() {
  return <CryptHub counts={await loadCryptCounts()} />;
}
