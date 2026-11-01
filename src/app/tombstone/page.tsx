import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { DeathActions, Tombstone } from "@/components/run/death";
import { site } from "@/lib/site";
import { deathFromQuery, tombstonePaths } from "@/server/narrative/tombstone-link";
import { tombstone, type Death } from "@/server/narrative/tombstones";

interface TombstonePageProps {
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
}

async function sharedDeath({ searchParams }: TombstonePageProps): Promise<Death> {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(await searchParams)) {
    const values = typeof value === "string" ? [value] : (value ?? []);
    for (const each of values) params.append(key, each);
  }
  return deathFromQuery(params) ?? notFound();
}

export async function generateMetadata(props: TombstonePageProps): Promise<Metadata> {
  const death = await sharedDeath(props);
  const stone = tombstone(death);
  const title = `${stone.handle}, ${stone.characterTitle}`;
  const image = {
    url: tombstonePaths(death).image,
    width: 1200,
    height: 630,
    alt: `${stone.handle}'s tombstone: ${stone.epitaph}`,
  };
  return {
    title,
    description: stone.epitaph,
    robots: { index: false, follow: true },
    openGraph: {
      type: "website",
      siteName: site.name,
      title,
      description: stone.epitaph,
      images: [image],
    },
    twitter: { card: "summary_large_image", title, description: stone.epitaph, images: [image] },
  };
}

/** Where a shared tombstone lands: the stone, and the same ways back into the night. */
export default async function TombstonePage(props: TombstonePageProps) {
  const death = await sharedDeath(props);
  const stone = tombstone(death);

  return (
    <main className="mx-auto flex min-h-dvh max-w-page flex-col items-center justify-center gap-8 px-4 py-12 md:px-8">
      <h1 className="text-balance text-center text-parchment type-display-l">
        A night in Hollow Creek ended here.
      </h1>
      <Tombstone stone={stone} />
      <DeathActions stone={stone} sharePath={tombstonePaths(death).share} />
      <Link
        href="/"
        className="inline-flex min-h-11 items-center text-ash type-ui underline underline-offset-4 ui-hover:text-parchment"
      >
        What is {site.name}?
      </Link>
    </main>
  );
}
