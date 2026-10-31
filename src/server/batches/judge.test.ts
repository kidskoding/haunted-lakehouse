import { PGlite } from "@electric-sql/pglite";
import { asc, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { beforeEach, describe, expect, it } from "vitest";
import * as schema from "../db/schema";
import { players, runEvents, runs } from "../db/schema";
import { generatePuzzle } from "../engine/registry";
import { porchLights } from "../engine/puzzles/porch-lights";
import { rowFromEvent } from "../runs/events";
import { NIGHT_ATTEMPT_TTL_SECONDS, signNightAttempt } from "./attempt";
import { expectedHashes } from "./expected";
import { judgeNightAttempt } from "./judge";

const secret = "a".repeat(32);
const now = 1_793_404_800;

async function freshDb() {
  const database = drizzle(new PGlite(), { schema });
  await migrate(database, { migrationsFolder: "drizzle" });
  return database;
}

type Db = Awaited<ReturnType<typeof freshDb>>;

async function openPorchRun(database: Db, candlesViaFailures = 0) {
  const [player] = await database.insert(players).values({}).returning();
  if (!player) throw new Error("no player");
  const [run] = await database
    .insert(runs)
    .values({ playerId: player.id, seed: "raven-pumpkin-13", character: "intern" })
    .returning();
  if (!run) throw new Error("no run");

  const events = [
    rowFromEvent({
      kind: "run_started",
      seed: "raven-pumpkin-13",
      character: "intern",
      unlockedActs: 1,
    }),
    rowFromEvent({
      kind: "hour_opened",
      slot: 1,
      puzzleId: "porch-lights",
      curse: null,
    }),
    ...Array.from({ length: candlesViaFailures }, () =>
      rowFromEvent({ kind: "attempt_failed", slot: 1, checkpointId: "quarter-past" }),
    ),
  ];

  await database.insert(runEvents).values(
    events.map((event, i) => ({
      runId: run.id,
      seq: i,
      kind: event.kind,
      payload: event.payload,
    })),
  );

  const attemptToken = await signNightAttempt(
    {
      playerId: player.id,
      runId: run.id,
      puzzleId: "porch-lights",
      expiresAt: now + NIGHT_ATTEMPT_TTL_SECONDS,
    },
    secret,
  );

  return { player, run, attemptToken };
}

describe("judgeNightAttempt", () => {
  let database: Db;

  beforeEach(async () => {
    database = await freshDb();
  });

  it("clears the hour when every hash matches and records hour_cleared", async () => {
    const { player, run, attemptToken } = await openPorchRun(database);
    const data = generatePuzzle(porchLights, "raven-pumpkin-13");
    const checkpoints = await expectedHashes(data);

    const result = await judgeNightAttempt(database, {
      runId: run.id,
      playerId: player.id,
      attemptToken,
      checkpoints,
      now,
      secret,
    });

    expect(result).toMatchObject({
      ok: true,
      survived: true,
      candles: 4,
      status: "playing",
      phase: "offering",
    });

    const stored = await database
      .select({ kind: runEvents.kind })
      .from(runEvents)
      .where(eq(runEvents.runId, run.id))
      .orderBy(asc(runEvents.seq));
    expect(stored.at(-1)).toEqual({ kind: "hour_cleared" });
  });

  it("returns only the first failing checkpoint, spends a candle, and keeps the run alive", async () => {
    const { player, run, attemptToken } = await openPorchRun(database);
    const data = generatePuzzle(porchLights, "raven-pumpkin-13");
    const expected = await expectedHashes(data);
    const first = data.checkpoints[0];
    if (!first) throw new Error("missing checkpoint");
    const checkpoints = {
      ...expected,
      [first.id]: Object.fromEntries(
        Object.keys(expected[first.id] ?? {}).map((table) => [table, "f".repeat(64)]),
      ),
    };

    const result = await judgeNightAttempt(database, {
      runId: run.id,
      playerId: player.id,
      attemptToken,
      checkpoints,
      now,
      secret,
    });

    expect(result).toEqual({
      ok: true,
      survived: false,
      checkpointId: first.id,
      revealedBatch: first.afterBatch,
      candles: 3,
      status: "playing",
      phase: "in-hour",
      unlocks: [],
    });

    const [runRow] = await database.select().from(runs).where(eq(runs.id, run.id));
    expect(runRow?.status).toBe("active");
  });

  it("kills the run when the last candles go out", async () => {
    // Intern starts with 4; three prior failures leave one candle for this miss.
    const { player, run, attemptToken } = await openPorchRun(database, 3);
    const data = generatePuzzle(porchLights, "raven-pumpkin-13");
    const expected = await expectedHashes(data);
    const first = data.checkpoints[0];
    if (!first) throw new Error("missing checkpoint");
    const checkpoints = {
      ...expected,
      [first.id]: Object.fromEntries(
        Object.keys(expected[first.id] ?? {}).map((table) => [table, "a".repeat(64)]),
      ),
    };

    const result = await judgeNightAttempt(database, {
      runId: run.id,
      playerId: player.id,
      attemptToken,
      checkpoints,
      now,
      secret,
    });

    expect(result).toMatchObject({
      ok: true,
      survived: false,
      candles: 0,
      status: "dead",
      phase: "ended",
    });
    const [runRow] = await database.select().from(runs).where(eq(runs.id, run.id));
    expect(runRow?.status).toBe("dead");
    expect(runRow?.endedAt).not.toBeNull();
  });

  it("rejects a missing or foreign attempt token", async () => {
    const { player, run } = await openPorchRun(database);
    expect(
      await judgeNightAttempt(database, {
        runId: run.id,
        playerId: player.id,
        attemptToken: "not-a-token",
        checkpoints: {},
        now,
        secret,
      }),
    ).toEqual({ ok: false, error: "invalid-attempt" });
  });
});
