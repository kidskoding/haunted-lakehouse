import type { Metadata } from "next";
import { notFound } from "next/navigation";
import type { RelicView } from "@/lib/run/bottom-bar";
import { RELICS } from "@/server/engine/run/relics";
import { RELIC_FLAVOR } from "@/server/narrative/flavor";
import { Gallery } from "./gallery";

export const metadata: Metadata = {
  title: "Bottom bar",
  robots: { index: false, follow: false },
};

/**
 * Development-only proving ground for the relic bar and run buttons; production builds answer
 * 404. The relic views are built here, on the server, the way the run screen will build them.
 */
export default function BottomBarDevPage() {
  if (process.env.NODE_ENV === "production") notFound();

  const relics: RelicView[] = RELICS.map((kind) => ({ kind, ...RELIC_FLAVOR[kind] }));
  return <Gallery relics={relics} />;
}
