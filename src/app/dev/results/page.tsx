import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Gallery } from "./gallery";

export const metadata: Metadata = {
  title: "Results grid",
  robots: { index: false, follow: false },
};

/** Development-only proving ground for the results grid; production builds answer 404. */
export default function ResultsDevPage() {
  if (process.env.NODE_ENV === "production") notFound();

  return <Gallery />;
}
