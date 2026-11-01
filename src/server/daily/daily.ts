import "server-only";
import { and, asc, count, desc, eq, gt, or } from "drizzle-orm";
import {
  type DailyAttemptView,
  type DailyBoard,
  type DailyStanding,
  type DailyToday,
  nextDailyAt,
  waitUntil,
} from "@/lib/crypt/daily";
import { db } from "../db/client";
import { dailyResults, players, runs } from "../db/schema";
import { dailySeed } from "../engine/seed";
import type { RunDatabase } from "../runs/load";
import { currentPlayerId } from "../session/session";

/** How many places the board shows. */
export const LEADERBOARD_SIZE = 50;

/** The UTC date of an instant, `YYYY-MM-DD`: the Daily Haunt turns over at midnight UTC. */
export function utcDate(now: Date): string {
  return now.toISOString().slice(0, 10);
}

/** Today's seed and when the next one is posted, as of `now`. */
export function dailyToday(now: Date): DailyToday {
  const date = utcDate(now);
  const nextAt = nextDailyAt(date);
  return { date, seed: dailySeed(date), nextAt, wait: waitUntil(nextAt, now) };
}

/** The caller's attempt at a day's haunt, with the run behind it. */
export type DailyAttempt =
  | { readonly kind: "none" }
  | { readonly kind: "in-progress"; readonly runId: string }
  | (Extract<DailyAttemptView, { kind: "finished" }> & { readonly runId: string });

/** A result's place on its day's board: one more than the results strictly ahead of it. */
async function rankOf(
  database: RunDatabase,
  date: string,
  result: { slotsCleared: number; candlesLeft: number },
): Promise<number> {
  const [ahead] = await database
    .select({ n: count() })
    .from(dailyResults)
    .where(
      and(
        eq(dailyResults.dailyDate, date),
        or(
          gt(dailyResults.slotsCleared, result.slotsCleared),
          and(
            eq(dailyResults.slotsCleared, result.slotsCleared),
            gt(dailyResults.candlesLeft, result.candlesLeft),
          ),
        ),
      ),
    );
  return (ahead?.n ?? 0) + 1;
}

/**
 * Whether a player has used their one attempt at a day's haunt. A run created for that date
 * counts from the moment it exists, so the run route can refuse a second one; the unique
 * `(player_id, daily_date)` key on runs backs it up against a race.
 */
export async function dailyAttemptWith(
  database: RunDatabase,
  playerId: string,
  date: string,
): Promise<DailyAttempt> {
  const [run] = await database
    .select({
      id: runs.id,
      status: runs.status,
      slotsCleared: dailyResults.slotsCleared,
      candlesLeft: dailyResults.candlesLeft,
    })
    .from(runs)
    .leftJoin(dailyResults, eq(dailyResults.runId, runs.id))
    .where(and(eq(runs.playerId, playerId), eq(runs.dailyDate, date)))
    .limit(1);
  if (!run) return { kind: "none" };
  if (run.status === "active") return { kind: "in-progress", runId: run.id };
  if (run.slotsCleared === null || run.candlesLeft === null) {
    return { kind: "finished", runId: run.id, result: null };
  }
  const result = { slotsCleared: run.slotsCleared, candlesLeft: run.candlesLeft };
  return {
    kind: "finished",
    runId: run.id,
    result: { ...result, rank: await rankOf(database, date, result) },
  };
}

/** {@link dailyAttemptWith} against the shared Postgres pool. */
export async function dailyAttempt(playerId: string, date: string): Promise<DailyAttempt> {
  return dailyAttemptWith(await db(), playerId, date);
}

/**
 * The top of a day's board: furthest into the night first, then most candles left, then
 * whoever finished first. Ties share a place. Only a GitHub sign-in shows a handle.
 */
export async function dailyBoardWith(
  database: RunDatabase,
  date: string,
  viewerId: string | null,
  limit = LEADERBOARD_SIZE,
): Promise<DailyBoard> {
  const [rows, totals] = await Promise.all([
    database
      .select({
        playerId: dailyResults.playerId,
        slotsCleared: dailyResults.slotsCleared,
        candlesLeft: dailyResults.candlesLeft,
        githubId: players.githubId,
        githubLogin: players.githubLogin,
      })
      .from(dailyResults)
      .innerJoin(players, eq(players.id, dailyResults.playerId))
      .where(eq(dailyResults.dailyDate, date))
      .orderBy(
        desc(dailyResults.slotsCleared),
        desc(dailyResults.candlesLeft),
        asc(dailyResults.createdAt),
        asc(dailyResults.playerId),
      )
      .limit(limit),
    database.select({ n: count() }).from(dailyResults).where(eq(dailyResults.dailyDate, date)),
  ]);

  let rank = 0;
  const board = rows.map((row, index) => {
    const previous = rows[index - 1];
    const tied =
      previous?.slotsCleared === row.slotsCleared && previous.candlesLeft === row.candlesLeft;
    if (!tied) rank = index + 1;
    return {
      rank,
      handle: row.githubId === null ? null : row.githubLogin,
      slotsCleared: row.slotsCleared,
      candlesLeft: row.candlesLeft,
      you: row.playerId === viewerId,
    };
  });
  return { rows: board, total: totals[0]?.n ?? 0 };
}

/**
 * The caller's attempt and today's board. Null when the session or database can't be read, so
 * the page says so instead of showing an empty board.
 */
export async function loadDailyStanding(date: string): Promise<DailyStanding | null> {
  try {
    const playerId = await currentPlayerId();
    const [attempt, board] = await Promise.all([
      playerId ? dailyAttempt(playerId, date) : ({ kind: "none" } as const),
      dailyBoardWith(await db(), date, playerId),
    ]);
    // A finished run's id stays on the server; one under way is the caller's own, to return to.
    return {
      attempt:
        attempt.kind === "finished"
          ? { kind: attempt.kind, result: attempt.result }
          : attempt.kind === "in-progress"
            ? { kind: attempt.kind, runId: attempt.runId }
            : { kind: attempt.kind },
      board,
    };
  } catch (error) {
    console.error("The Daily Haunt couldn't read today's board", error);
    return null;
  }
}
