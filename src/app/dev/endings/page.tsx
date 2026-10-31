import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { endingFixtures } from "./fixtures";
import { Gallery } from "./gallery";

export const metadata: Metadata = {
  title: "Endings",
  robots: { index: false, follow: false },
};

/**
 * Development-only proving ground for the ending moment; `?fixture=<id>` opens one.
 * Production builds answer 404. Fixtures are rendered here, on the server, from the real text.
 */
export default async function EndingsDevPage({
  searchParams,
}: {
  readonly searchParams: Promise<{ fixture?: string | string[] }>;
}) {
  if (process.env.NODE_ENV === "production") notFound();
  const { fixture } = await searchParams;
  const fixtures = endingFixtures();
  const current = fixtures.find((candidate) => candidate.id === fixture) ?? fixtures[0];
  if (!current) notFound();
  return <Gallery key={current.id} fixtures={fixtures} current={current} />;
}
