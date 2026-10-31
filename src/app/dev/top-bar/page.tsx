import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Gallery } from "./gallery";

export const metadata: Metadata = {
  title: "Top bar",
  robots: { index: false, follow: false },
};

/** Development-only proving ground for the run top bar; production builds answer 404. */
export default function TopBarDevPage() {
  if (process.env.NODE_ENV === "production") notFound();

  return <Gallery />;
}
