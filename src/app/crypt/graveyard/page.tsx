import type { Metadata } from "next";
import { Graveyard } from "@/components/crypt/graveyard";
import {
  GRAVEYARD_CHARACTERS,
  GRAVEYARD_HOURS,
  graveyardFilterFrom,
  loadGraveyard,
} from "@/server/crypt/graveyard";

export const metadata: Metadata = {
  title: "The Graveyard",
  description: "Recent tombstones from Hollow Creek's Halloween nights, each replayable by seed.",
  robots: { index: false, follow: true },
};

interface GraveyardPageProps {
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
}

/** Recent stones across players. Read per request, since the hill changes with every death. */
export default async function GraveyardPage({ searchParams }: GraveyardPageProps) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(await searchParams)) {
    const values = typeof value === "string" ? [value] : (value ?? []);
    for (const each of values) params.append(key, each);
  }
  const filter = graveyardFilterFrom(params);
  return (
    <Graveyard
      filter={filter}
      options={{ characters: GRAVEYARD_CHARACTERS, hours: GRAVEYARD_HOURS }}
      page={await loadGraveyard(filter)}
    />
  );
}
