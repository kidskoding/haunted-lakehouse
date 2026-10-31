import { PGlite } from "@electric-sql/pglite";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { beforeEach, describe, expect, it } from "vitest";
import * as schema from "./schema";
import { dailyResults, fragments, players, runEvents, runs, unlocks } from "./schema";

// The committed migrations are applied to an in-process Postgres, so these tests fail if
// the schema and the migrations drift apart.
async function freshDb() {
  const db = drizzle(new PGlite(), { schema });
  await migrate(db, { migrationsFolder: "drizzle" });
  return db;
}

type Db = Awaited<ReturnType<typeof freshDb>>;

async function newPlayer(db: Db) {
  const [player] = await db.insert(players).values({}).returning();
  if (!player) throw new Error("insert returned no player");
  return player;
}

async function newRun(db: Db, playerId: string, dailyDate: string | null = null) {
  const [run] = await db
    .insert(runs)
    .values({ playerId, seed: "raven-pumpkin-13", character: "intern", dailyDate })
    .returning();
  if (!run) throw new Error("insert returned no run");
  return run;
}

describe("database schema", () => {
  let db: Db;

  beforeEach(async () => {
    db = await freshDb();
  });

  it("creates every table from the committed migrations", async () => {
    const result = await db.execute<{ table_name: string }>(
      "select table_name from information_schema.tables where table_schema = 'public' order by table_name",
    );
    expect(result.rows.map((r) => r.table_name)).toEqual([
      "daily_results",
      "fragments",
      "players",
      "run_events",
      "runs",
      "unlocks",
    ]);
  });

  it("starts players anonymous and runs active", async () => {
    const player = await newPlayer(db);
    const run = await newRun(db, player.id);
    expect(player.githubId).toBeNull();
    expect(run.status).toBe("active");
  });

  it("allows one Daily Haunt attempt per player per day, and any number of normal runs", async () => {
    const player = await newPlayer(db);
    await newRun(db, player.id);
    await newRun(db, player.id);
    await newRun(db, player.id, "2026-10-31");
    await expect(newRun(db, player.id, "2026-10-31")).rejects.toThrow();
  });

  it("records a daily result only for the player's own Daily Haunt run on that date", async () => {
    const player = await newPlayer(db);
    const other = await newPlayer(db);
    const daily = await newRun(db, player.id, "2026-10-31");
    const normal = await newRun(db, player.id);
    const result = { slotsCleared: 3, candlesLeft: 1 };

    await expect(
      db
        .insert(dailyResults)
        .values({ ...result, dailyDate: "2026-10-31", playerId: other.id, runId: daily.id }),
    ).rejects.toThrow();
    await expect(
      db
        .insert(dailyResults)
        .values({ ...result, dailyDate: "2026-11-01", playerId: player.id, runId: daily.id }),
    ).rejects.toThrow();
    await expect(
      db
        .insert(dailyResults)
        .values({ ...result, dailyDate: "2026-10-31", playerId: player.id, runId: normal.id }),
    ).rejects.toThrow();
    await db
      .insert(dailyResults)
      .values({ ...result, dailyDate: "2026-10-31", playerId: player.id, runId: daily.id });

    await db.delete(runs).where(eq(runs.id, daily.id));
    expect(await db.select().from(dailyResults)).toHaveLength(0);
  });

  it("orders run events by a sequence number that is unique within a run", async () => {
    const player = await newPlayer(db);
    const run = await newRun(db, player.id);
    const event = { runId: run.id, seq: 0, kind: "run_started", payload: {} };
    await db.insert(runEvents).values(event);
    await expect(db.insert(runEvents).values(event)).rejects.toThrow();
  });

  it("keeps a player's fragments and unlocks when the run that found them is deleted", async () => {
    const player = await newPlayer(db);
    const run = await newRun(db, player.id);
    await db.insert(fragments).values({ playerId: player.id, fragmentId: "page-1", runId: run.id });
    await db.insert(unlocks).values({ playerId: player.id, kind: "act", key: "act-2" });
    await db.insert(runEvents).values({ runId: run.id, seq: 0, kind: "run_started", payload: {} });

    await db.delete(runs).where(eq(runs.id, run.id));

    const [fragment] = await db.select().from(fragments);
    expect(fragment).toMatchObject({ fragmentId: "page-1", runId: null });
    expect(await db.select().from(unlocks)).toHaveLength(1);
    expect(await db.select().from(runEvents)).toHaveLength(0);
  });

  it("rejects a second player claiming the same GitHub account", async () => {
    await db.insert(players).values({ githubId: 68204671, githubLogin: "someone" });
    await expect(
      db.insert(players).values({ githubId: 68204671, githubLogin: "someone" }),
    ).rejects.toThrow();
  });
});
