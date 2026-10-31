import { PGlite } from "@electric-sql/pglite";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as schema from "../db/schema";
import { dailyResults, players, runs } from "../db/schema";
import { dailySeed } from "../engine/seed";
import { currentPlayerId } from "../session/session";
import { dailyAttemptWith, dailyBoardWith, dailyToday, loadDailyStanding, utcDate } from "./daily";

vi.mock("../session/session", () => ({ currentPlayerId: vi.fn() }));

const TODAY = "2026-10-31";

async function freshDb() {
  const database = drizzle(new PGlite(), { schema });
  await migrate(database, { migrationsFolder: "drizzle" });
  return database;
}

type Db = Awaited<ReturnType<typeof freshDb>>;

let database: Db;

beforeEach(async () => {
  database = await freshDb();
});

afterEach(() => {
  vi.restoreAllMocks();
});

async function newPlayer(github?: { id: number; login: string }) {
  const [player] = await database
    .insert(players)
    .values(github ? { githubId: github.id, githubLogin: github.login } : {})
    .returning();
  if (!player) throw new Error("no player");
  return player.id;
}

async function dailyRun(
  playerId: string,
  status: "active" | "survived" | "dead" | "abandoned" = "active",
  date = TODAY,
) {
  const [run] = await database
    .insert(runs)
    .values({ playerId, seed: dailySeed(date), character: "intern", status, dailyDate: date })
    .returning();
  if (!run) throw new Error("no run");
  return run.id;
}

async function finished(
  slotsCleared: number,
  candlesLeft: number,
  github?: { id: number; login: string },
  date = TODAY,
) {
  const playerId = await newPlayer(github);
  const runId = await dailyRun(playerId, "dead", date);
  await database
    .insert(dailyResults)
    .values({ dailyDate: date, playerId, runId, slotsCleared, candlesLeft });
  return playerId;
}

describe("dailyToday", () => {
  it("turns over at midnight UTC, whatever the hour elsewhere", () => {
    const late = dailyToday(new Date("2026-10-31T23:59:30Z"));
    expect(late).toEqual({
      date: TODAY,
      seed: dailySeed(TODAY),
      nextAt: "2026-11-01T00:00:00.000Z",
      wait: "1 minute",
    });
    expect(dailyToday(new Date("2026-11-01T00:00:00Z")).date).toBe("2026-11-01");
    expect(dailyToday(new Date("2026-10-31T17:48:00Z")).wait).toBe("6 hours 12 minutes");
    expect(utcDate(new Date("2026-12-31T23:00:00-05:00"))).toBe("2027-01-01");
  });
});

describe("dailyAttemptWith", () => {
  it("is none for a player with no run on that date, even with other runs", async () => {
    const playerId = await newPlayer();
    await database.insert(runs).values({ playerId, seed: "raven-pumpkin-13", character: "intern" });
    await dailyRun(playerId, "dead", "2026-10-30");
    expect(await dailyAttemptWith(database, playerId, TODAY)).toEqual({ kind: "none" });
  });

  it("counts the attempt as used the moment the run exists", async () => {
    const playerId = await newPlayer();
    const runId = await dailyRun(playerId);
    expect(await dailyAttemptWith(database, playerId, TODAY)).toEqual({
      kind: "in-progress",
      runId,
    });
  });

  it("gives a finished run its result and its place, ties sharing it", async () => {
    await finished(5, 2);
    await finished(3, 3);
    await finished(3, 1);
    const playerId = await newPlayer();
    const runId = await dailyRun(playerId, "dead");
    await database
      .insert(dailyResults)
      .values({ dailyDate: TODAY, playerId, runId, slotsCleared: 3, candlesLeft: 1 });
    expect(await dailyAttemptWith(database, playerId, TODAY)).toEqual({
      kind: "finished",
      runId,
      result: { slotsCleared: 3, candlesLeft: 1, rank: 3 },
    });
  });

  it("is finished with no result for a run that ended without one", async () => {
    const playerId = await newPlayer();
    const runId = await dailyRun(playerId, "abandoned");
    expect(await dailyAttemptWith(database, playerId, TODAY)).toEqual({
      kind: "finished",
      runId,
      result: null,
    });
  });

  it("is backed by the database refusing a second run for the same day", async () => {
    const playerId = await newPlayer();
    await dailyRun(playerId, "dead");
    await expect(dailyRun(playerId)).rejects.toThrow();
  });
});

describe("dailyBoardWith", () => {
  it("ranks by hours cleared, then candles left, sharing places on a tie", async () => {
    await finished(3, 1, { id: 1, login: "wren" });
    const second = await finished(10, 0);
    await finished(10, 2, { id: 2, login: "marisol" });
    await finished(3, 1, { id: 3, login: "thorne" });
    await finished(2, 3);
    await finished(9, 9, { id: 4, login: "yesterday" }, "2026-10-30");

    const board = await dailyBoardWith(database, TODAY, second);
    expect(board.total).toBe(5);
    expect(board.rows).toEqual([
      { rank: 1, handle: "marisol", slotsCleared: 10, candlesLeft: 2, you: false },
      { rank: 2, handle: null, slotsCleared: 10, candlesLeft: 0, you: true },
      { rank: 3, handle: "wren", slotsCleared: 3, candlesLeft: 1, you: false },
      { rank: 3, handle: "thorne", slotsCleared: 3, candlesLeft: 1, you: false },
      { rank: 5, handle: null, slotsCleared: 2, candlesLeft: 3, you: false },
    ]);
  });

  it("caps the board but still counts everyone on it", async () => {
    for (let i = 0; i < 4; i++) await finished(i, 0);
    const board = await dailyBoardWith(database, TODAY, null, 2);
    expect(board.rows.map((row) => row.slotsCleared)).toEqual([3, 2]);
    expect(board.total).toBe(4);
  });

  it("is empty on a day nobody has finished", async () => {
    expect(await dailyBoardWith(database, TODAY, null)).toEqual({ rows: [], total: 0 });
  });

  it("drops a player's handle once their GitHub link is gone", async () => {
    const playerId = await finished(4, 1, { id: 7, login: "gone" });
    await database.update(players).set({ githubId: null }).where(eq(players.id, playerId));
    const board = await dailyBoardWith(database, TODAY, null);
    expect(board.rows[0]?.handle).toBeNull();
  });
});

describe("loadDailyStanding", () => {
  it("says it couldn't be read, and logs why, when the session can't be read", async () => {
    const failure = new Error("session store unreachable");
    vi.mocked(currentPlayerId).mockRejectedValueOnce(failure);
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(loadDailyStanding(TODAY)).resolves.toBeNull();
    expect(logged).toHaveBeenCalledWith("The Daily Haunt couldn't read today's board", failure);
  });
});
