/** Today's Daily Haunt, as the board outside town hall posts it. */
export interface DailyToday {
  /** The UTC date the seed belongs to, `YYYY-MM-DD`. */
  readonly date: string;
  readonly seed: string;
  /** When the next seed is posted: the coming midnight UTC, as an ISO instant. */
  readonly nextAt: string;
  /** How long until then, at the moment the board was read: "6 hours 12 minutes". */
  readonly wait: string;
}

/** How far a finished Daily Haunt got, and where it stands among today's. */
export interface DailyResult {
  readonly slotsCleared: number;
  readonly candlesLeft: number;
  /** Shared by ties: two players level on hours and candles hold the same place. */
  readonly rank: number;
}

/** The caller's one attempt at today's haunt. */
export type DailyAttemptView =
  | { readonly kind: "none" }
  | { readonly kind: "in-progress" }
  | {
      readonly kind: "finished";
      /** Null when the run ended without a result on the board, as an abandoned one does. */
      readonly result: DailyResult | null;
    };

export interface LeaderboardRow {
  readonly rank: number;
  /** The GitHub handle of a signed-in player; null for anonymous play. */
  readonly handle: string | null;
  readonly slotsCleared: number;
  readonly candlesLeft: number;
  /** Whether this row is the caller's own. */
  readonly you: boolean;
}

export interface DailyBoard {
  /** The top of today's board, best first. */
  readonly rows: readonly LeaderboardRow[];
  /** Every result posted today, of which `rows` is the top. */
  readonly total: number;
}

/** The parts of the Daily Haunt that come from the database. */
export interface DailyStanding {
  readonly attempt: DailyAttemptView;
  readonly board: DailyBoard;
}

/** The coming midnight UTC after `date`, as an ISO instant. */
export function nextDailyAt(date: string): string {
  const [year = 0, month = 1, day = 1] = date.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day + 1)).toISOString();
}

const plural = (n: number, word: string) => `${String(n)} ${word}${n === 1 ? "" : "s"}`;

/** How long until `nextAt`, in words a clock face would say: "6 hours 12 minutes". */
export function waitUntil(nextAt: string, now: Date): string {
  const minutes = Math.max(1, Math.ceil((Date.parse(nextAt) - now.getTime()) / 60_000));
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return plural(rest, "minute");
  return rest === 0 ? plural(hours, "hour") : `${plural(hours, "hour")} ${plural(rest, "minute")}`;
}

/** The date of a haunt as the town writes it: "Saturday, October 31". */
export function dailyDateLabel(date: string): string {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${date}T00:00:00Z`));
}

/** The link that starts today's one attempt. */
export function dailyRunHref(seed: string): string {
  return `/run/new?${new URLSearchParams({ seed, daily: "1" }).toString()}`;
}
