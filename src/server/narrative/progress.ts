import "server-only";
import type { EndingId } from "../engine/run/types";

export const PAGE_IDS = [
  "page-1",
  "page-2",
  "page-3",
  "page-4",
  "page-5",
  "page-6",
  "page-7",
] as const;

export type PageId = (typeof PAGE_IDS)[number];

/** The three boss endings, plus the one that needs every ledger page. */
export type StoryEndingId = EndingId | "true";

/** What a player has seen across every run, which decides how much of the story they hear. */
export interface StoryProgress {
  /** Runs this player has finished, however they ended. */
  readonly runsFinished: number;
  readonly endingsSeen: readonly StoryEndingId[];
  readonly pagesHeld: readonly PageId[];
}

export function holdsEveryPage(progress: StoryProgress): boolean {
  return PAGE_IDS.every((page) => progress.pagesHeld.includes(page));
}
