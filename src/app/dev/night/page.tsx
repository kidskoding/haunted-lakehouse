import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Gallery } from "./gallery";

export const metadata: Metadata = {
  title: "Run the night",
  robots: { index: false, follow: false },
};

/** Development-only proving ground for the Run the night timeline; production builds answer 404. */
export default function NightDevPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <Gallery />;
}
