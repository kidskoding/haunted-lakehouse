import Link from "next/link";
import { PanelSkeleton } from "@/components/ui/panel";
import { buttonClassName } from "@/components/ui/button-styles";
import { cx } from "@/components/ui/cx";
import {
  type DailyAttemptView,
  type DailyBoard,
  type DailyStanding,
  type DailyToday,
  type LeaderboardRow,
  dailyDateLabel,
  dailyRunHref,
} from "@/lib/crypt/daily";

export interface DailyHauntProps {
  readonly today: DailyToday;
  /** The caller's attempt and today's board; "loading" while they're read, null when they can't be. */
  readonly standing: DailyStanding | "loading" | null;
}

const ANONYMOUS = "A New Hire";

const plural = (n: number, one: string, many: string) => `${String(n)} ${n === 1 ? one : many}`;

const ORDINAL = new Intl.PluralRules("en-US", { type: "ordinal" });
const ORDINAL_SUFFIX: Readonly<Record<Intl.LDMLPluralRule, string>> = {
  zero: "th",
  one: "st",
  two: "nd",
  few: "rd",
  many: "th",
  other: "th",
};

/** "1st", "22nd", "113th". */
const ordinal = (n: number) => `${String(n)}${ORDINAL_SUFFIX[ORDINAL.select(n)]}`;

function Attempt({ attempt, seed }: { readonly attempt: DailyAttemptView; readonly seed: string }) {
  if (attempt.kind === "none") {
    return (
      <div className="flex flex-col gap-3">
        <Link
          href={dailyRunHref(seed)}
          className={`${buttonClassName("primary", "lg")} self-start`}
        >
          Begin today&rsquo;s haunt
        </Link>
        <p className="max-w-copy text-pretty text-ash type-prose-s">
          One attempt. The moment it begins, it counts.
        </p>
      </div>
    );
  }
  if (attempt.kind === "in-progress") {
    return (
      <div className="flex flex-col gap-3">
        <p className="max-w-copy text-pretty text-parchment type-prose">
          Your haunt is still under way. It&rsquo;s your one attempt today, so see it through.
        </p>
        <Link href="/run" className={`${buttonClassName("primary", "lg")} self-start`}>
          Return to the night
        </Link>
      </div>
    );
  }
  const { result } = attempt;
  return (
    <div className="flex flex-col gap-2 rounded-s bg-tint-flame px-5 py-4">
      <p className="text-parchment type-prose">You&rsquo;ve had your try today.</p>
      <p className="text-pretty text-ash type-prose-s">
        {result
          ? `${plural(result.slotsCleared, "hour", "hours")} cleared, ${plural(result.candlesLeft, "candle", "candles")} left. ${ordinal(result.rank)} on the board.`
          : "It ended before it reached the board."}
      </p>
    </div>
  );
}

function Row({ row }: { readonly row: LeaderboardRow }) {
  return (
    <tr className={cx(row.you ? "bg-tint-flame text-flame" : "text-parchment")}>
      <td className="py-3 pr-3 pl-4 text-right sm:pl-6">{row.rank}</td>
      <th scope="row" className="px-3 py-3 text-left font-normal [overflow-wrap:anywhere]">
        {row.handle ?? <span className="text-ash">{ANONYMOUS}</span>}
        {row.you ? <span className="text-flame"> (you)</span> : null}
      </th>
      <td className="px-3 py-3 text-right">{row.slotsCleared}</td>
      <td className="py-3 pr-4 pl-3 text-right sm:pr-6">{row.candlesLeft}</td>
    </tr>
  );
}

function Board({ board }: { readonly board: DailyBoard }) {
  if (board.rows.length === 0) {
    return (
      <p className="max-w-copy text-pretty text-ash type-prose">
        Nobody has finished today&rsquo;s haunt yet. The first name on the board could be yours.
      </p>
    );
  }
  const shown = board.rows.length;
  return (
    <div className="flex flex-col gap-4">
      <table className="w-full rounded-s bg-panel type-data tabular-nums">
        <caption className="sr-only">
          Today&rsquo;s board, by hours cleared, then candles left
        </caption>
        <thead className="text-smoke">
          <tr>
            <th scope="col" className="pt-4 pr-3 pb-2 pl-4 text-right font-normal sm:pl-6">
              Place
            </th>
            <th scope="col" className="px-3 pt-4 pb-2 text-left font-normal">
              Who
            </th>
            <th scope="col" className="px-3 pt-4 pb-2 text-right font-normal">
              Hours<span className="max-sm:sr-only"> cleared</span>
            </th>
            <th scope="col" className="pt-4 pr-4 pb-2 pl-3 text-right font-normal sm:pr-6">
              Candles<span className="max-sm:sr-only"> left</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {board.rows.map((row, index) => (
            // Ties share a place, so the position on the board is the only unique key.
            <Row key={index} row={row} />
          ))}
        </tbody>
      </table>
      <p className="text-smoke type-data">
        {board.total > shown
          ? `The top ${String(shown)} of ${String(board.total)} who have finished today.`
          : `${plural(board.total, "new hire has", "new hires have")} finished today.`}
      </p>
    </div>
  );
}

/**
 * The Daily Haunt: today's shared seed and when the next is posted, the caller's one attempt,
 * and today's board. Server-renderable; it needs no script.
 */
export function DailyHaunt({ today, standing }: DailyHauntProps) {
  return (
    <main className="mx-auto grid min-h-dvh w-full max-w-page content-start gap-y-12 px-4 py-16 md:px-8 md:py-24 lg:grid-cols-12 lg:gap-x-8">
      <header className="flex flex-col gap-5 lg:sticky lg:top-24 lg:col-span-5 lg:self-start">
        <h1 className="text-balance text-parchment type-display-l">The Daily Haunt</h1>
        <p className="max-w-copy text-pretty text-ash type-prose">
          {dailyDateLabel(today.date)}. Every new hire in town gets the same night today, and one
          try at it:
        </p>
        <p className="text-flame type-display-m [overflow-wrap:anywhere]">{today.seed}</p>
        <p className="max-w-copy text-pretty text-smoke type-prose-s">
          The next haunt is posted at <time dateTime={today.nextAt}>midnight UTC</time>, in{" "}
          {today.wait}.
        </p>
        <div className="mt-3">
          {standing === "loading" ? (
            <PanelSkeleton label="Checking for your attempt" lines={[0.5, 0.7]} />
          ) : standing ? (
            <Attempt attempt={standing.attempt} seed={today.seed} />
          ) : null}
        </div>
        <Link href="/crypt" className={`${buttonClassName("ghost", "md")} self-start`}>
          Back to the Crypt
        </Link>
      </header>
      <section aria-labelledby="daily-board" className="flex flex-col gap-6 lg:col-span-7">
        <h2 id="daily-board" className="text-parchment type-display-m">
          Today&rsquo;s board
        </h2>
        {standing === "loading" ? (
          <PanelSkeleton label="Reading today's board" lines={[0.9, 0.82, 0.86, 0.7, 0.78]} />
        ) : standing ? (
          <Board board={standing.board} />
        ) : (
          <p role="status" className="max-w-copy text-pretty text-ash type-prose">
            Wren can&rsquo;t read the board outside town hall tonight. Today&rsquo;s seed still
            stands; come back in a little while to play it.
          </p>
        )}
      </section>
    </main>
  );
}
