import type { Metadata } from "next";
import { Codex } from "@/components/crypt/codex";
import { loadCodex } from "@/server/codex/codex";

export const metadata: Metadata = {
  title: "The Codex",
  robots: { index: false, follow: false },
};

/** The player's earned autopsies. They come from the caller's session, so it renders per request. */
export default async function CodexPage() {
  return <Codex entries={await loadCodex()} />;
}
