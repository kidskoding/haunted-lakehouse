import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { introFixtures } from "./fixtures";
import { Gallery } from "./gallery";

export const metadata: Metadata = {
  title: "Hour intros",
  robots: { index: false, follow: false },
};

/**
 * Development-only proving ground for the curse and boss intros; `?fixture=<id>` opens one.
 * Production builds answer 404. Fixtures are read here, on the server, from the engine.
 */
export default async function IntrosDevPage({
  searchParams,
}: {
  readonly searchParams: Promise<{ fixture?: string | string[] }>;
}) {
  if (process.env.NODE_ENV === "production") notFound();
  const { fixture } = await searchParams;
  const fixtures = introFixtures();
  const current = fixtures.find((candidate) => candidate.id === fixture) ?? fixtures[0];
  if (!current) notFound();
  return <Gallery key={current.id} fixtures={fixtures} current={current} />;
}
