import type { Metadata } from "next";
import { Ledger } from "@/components/crypt/ledger";
import { loadLedger } from "@/server/ledger/ledger";

export const metadata: Metadata = {
  title: "The Ledger",
  robots: { index: false, follow: false },
};

/** The torn pages the player has found. They come from the caller's session, so it renders per request. */
export default async function LedgerPage() {
  return <Ledger ledger={await loadLedger()} />;
}
