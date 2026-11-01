import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { beforeEach, describe, expect, it } from "vitest";
import * as schema from "../db/schema";
import { players, runEvents, runs } from "../db/schema";
import { generateHour } from "../engine/curses/apply";
import { thirteenthDoor } from "../engine/puzzles/thirteenth-door/puzzle";
import { generatePuzzle } from "../engine/registry";
import type { RunEvent } from "../engine/run/types";
import { rowFromEvent } from "../runs/events";
import { runMachine } from "../runs/load";
import { getBatch, listPreviewBatches, startNightAttempt } from "./access";

const secret = "a".repeat(32);
const now = 1_793_404_800;

async function freshDb() {
  const database = drizzle(new PGlite(), { schema });
  await migrate(database, { migrationsFolder: "drizzle" });
  return database;
}

type Db = Awaited<ReturnType<typeof freshDb>>;

async function seededRun(database: Db, withHour = true) {
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
    ...(withHour
      ? [
          rowFromEvent({
            kind: "hour_opened",
            slot: 1,
            puzzleId: "porch-lights",
            curse: null,
          }),
        ]
      : []),
  ];

  await database.insert(runEvents).values(
    events.map((event, i) => ({
      runId: run.id,
      seq: i,
      kind: event.kind,
      payload: event.payload,
    })),
  );

  return { player, run };
}

describe("batch access", () => {
  let database: Db;

  beforeEach(async () => {
    database = await freshDb();
  });

  it("lists only the visible porch-light batches for an open hour", async () => {
    const { player, run } = await seededRun(database);
    const listed = await listPreviewBatches(database, run.id, player.id);
    expect(listed.ok).toBe(true);
    if (!listed.ok) return;
    expect(listed.puzzleId).toBe("porch-lights");
    expect(listed.visibleBatchCount).toBe(7);
    expect(listed.totalBatches).toBe(9);
    expect(listed.batches).toHaveLength(7);
    expect(listed.batches.map((b) => b.index)).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });

  it("refuses a hidden batch until a night attempt token is presented", async () => {
    const { player, run } = await seededRun(database);
    const denied = await getBatch(database, {
      runId: run.id,
      playerId: player.id,
      index: 7,
      attemptToken: null,
      now,
      secret,
    });
    expect(denied).toEqual({ ok: false, error: "hidden" });

    const started = await startNightAttempt(database, {
      runId: run.id,
      playerId: player.id,
      now,
      secret,
    });
    expect(started.ok).toBe(true);
    if (!started.ok) return;

    const allowed = await getBatch(database, {
      runId: run.id,
      playerId: player.id,
      index: 7,
      attemptToken: started.attemptToken,
      now,
      secret,
    });
    expect(allowed.ok).toBe(true);
    if (allowed.ok) expect(allowed.batch.index).toBe(7);
  });

  it("rejects another player's run, a closed hour, and a foreign attempt token", async () => {
    const { player, run } = await seededRun(database);
    const [stranger] = await database.insert(players).values({}).returning();
    if (!stranger) throw new Error("no stranger");

    expect(await listPreviewBatches(database, run.id, stranger.id)).toEqual({
      ok: false,
      error: "not-found",
    });

    const closed = await seededRun(database, false);
    expect(await listPreviewBatches(database, closed.run.id, closed.player.id)).toEqual({
      ok: false,
      error: "no-open-hour",
    });

    const started = await startNightAttempt(database, {
      runId: run.id,
      playerId: player.id,
      now,
      secret,
    });
    if (!started.ok) throw new Error("expected attempt");

    const other = await seededRun(database);
    expect(
      await getBatch(database, {
        runId: other.run.id,
        playerId: other.player.id,
        index: 7,
        attemptToken: started.attemptToken,
        now,
        secret,
      }),
    ).toEqual({ ok: false, error: "hidden" });
  });

  it("serves a possessed hour's batches in their drifted shape", async () => {
    const seed = "raven-pumpkin-13";
    const [player] = await database.insert(players).values({}).returning();
    if (!player) throw new Error("no player");
    const [run] = await database
      .insert(runs)
      .values({ playerId: player.id, seed, character: "intern" })
      .returning();
    if (!run) throw new Error("no run");

    const events: RunEvent[] = [
      { kind: "run_started", seed, character: "intern", unlockedActs: 1 },
      { kind: "hour_opened", slot: 1, puzzleId: "porch-lights", curse: null },
      { kind: "hour_cleared", slot: 1 },
    ];
    const offer = runMachine.next(runMachine.replay(events));
    if (offer?.kind !== "relic_offered") throw new Error("expected a relic offer");
    events.push(offer, { kind: "relic_declined" });
    events.push({ kind: "hour_opened", slot: 2, puzzleId: thirteenthDoor.id, curse: "possession" });
    await database
      .insert(runEvents)
      .values(events.map((event, seq) => ({ runId: run.id, seq, ...rowFromEvent(event) })));

    const possessed = generateHour(thirteenthDoor, seed, "possession");
    if (!possessed.possession) throw new Error("The hour declares a possessable column.");
    const started = await startNightAttempt(database, {
      runId: run.id,
      playerId: player.id,
      now,
      secret,
    });
    if (!started.ok) throw new Error(started.error);

    const served = [];
    for (const { index } of possessed.data.batches) {
      const one = await getBatch(database, {
        runId: run.id,
        playerId: player.id,
        index,
        attemptToken: started.attemptToken,
        now,
        secret,
      });
      if (!one.ok) throw new Error(one.error);
      served.push(one.batch);
    }
    expect(served).toEqual(
      possessed.data.batches.map(({ index, arrivesAt, feeds }) => ({ index, arrivesAt, feeds })),
    );
    expect(served).not.toEqual(
      generatePuzzle(thirteenthDoor, seed).batches.map(({ index, arrivesAt, feeds }) => ({
        index,
        arrivesAt,
        feeds,
      })),
    );
  });
});
