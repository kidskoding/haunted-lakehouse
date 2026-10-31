/** How much of something the player holds, out of everything there is to hold. */
export interface Tally {
  readonly held: number;
  readonly total: number;
}

/**
 * The counts the hub can show from server-side unlocks. Null when they couldn't be read: the
 * hub then omits them rather than guessing.
 */
export interface CryptCounts {
  readonly characters: Tally;
  readonly pages: Tally;
}

export type CryptDestinationId = "codex" | "graveyard" | "ledger" | "characters" | "daily";

export interface CryptDestination {
  readonly id: CryptDestinationId;
  readonly name: string;
  readonly href: string;
  readonly line: string;
  /** Which count, if any, sits under this destination. */
  readonly count?: keyof CryptCounts;
}

export const CRYPT_DESTINATIONS: readonly CryptDestination[] = [
  {
    id: "codex",
    name: "The Codex",
    href: "/crypt/codex",
    line: "Every autopsy you’ve earned, kept where you can read it again.",
  },
  {
    id: "graveyard",
    name: "The Graveyard",
    href: "/crypt/graveyard",
    line: "Every night that went out, under its own stone. Dig any of them up by its seed.",
  },
  {
    id: "ledger",
    name: "The Ledger",
    href: "/crypt/ledger",
    line: "The torn pages of the old book, laid out as you find them.",
    count: "pages",
  },
  {
    id: "characters",
    name: "Characters",
    href: "/crypt/characters",
    line: "Who keeps watch on the next night.",
    count: "characters",
  },
  {
    id: "daily",
    name: "The Daily Haunt",
    href: "/crypt/daily",
    line: "One seed for the whole town today, and one attempt at it.",
  },
];

/** The count line under a destination, such as "3 of 7 pages found" or "All 4 unlocked". */
export function tallyLine(kind: keyof CryptCounts, { held, total }: Tally): string {
  const suffix = kind === "pages" ? " pages found" : " unlocked";
  return held >= total
    ? `All ${String(total)}${suffix}`
    : `${String(held)} of ${String(total)}${suffix}`;
}
