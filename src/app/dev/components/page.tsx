import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Gallery } from "./gallery";

export const metadata: Metadata = {
  title: "Core components",
  robots: { index: false, follow: false },
};

/** Development-only gallery of the core UI components in every state; production answers 404. */
export default function ComponentsDevPage() {
  if (process.env.NODE_ENV === "production") notFound();

  return <Gallery />;
}
