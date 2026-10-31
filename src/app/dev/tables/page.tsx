import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Gallery } from "./gallery";

export const metadata: Metadata = {
  title: "Table browser",
  robots: { index: false, follow: false },
};

/** Development-only proving ground for the table browser; production builds answer 404. */
export default function TablesDevPage() {
  if (process.env.NODE_ENV === "production") notFound();

  return <Gallery />;
}
