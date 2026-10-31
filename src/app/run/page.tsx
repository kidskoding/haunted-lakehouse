import type { Metadata } from "next";
import { RunScreen } from "@/components/run/screen/run-screen";

export const metadata: Metadata = {
  title: "The night",
  robots: { index: false, follow: false },
};

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function one(value: string | string[] | undefined): string | null {
  return typeof value === "string" && value !== "" ? value : null;
}

/**
 * The run screen. `?character=&seed=` (from the character select) starts a run, `&daily=1`
 * makes it today's Daily Haunt; `?run=` resumes one. The server checks everything; the page only passes the choice along.
 */
export default async function RunPage({ searchParams }: { readonly searchParams: SearchParams }) {
  const params = await searchParams;
  return (
    <RunScreen
      runId={one(params.run)}
      character={one(params.character)}
      seed={one(params.seed)}
      daily={one(params.daily) === "1"}
    />
  );
}
