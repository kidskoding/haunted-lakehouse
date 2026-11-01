import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as schema from "../db/schema";
import { players, runEvents, runs } from "../db/schema";
import type { CurseId, RunEvent } from "../engine/run/types";
import { rowFromEvent } from "../runs/events";
import { loadEarnedClears } from "./earned";

async function freshDb() {
  const database = drizzle(new PGlite(), { schema });
  await migrate(database, { migrationsFolder: "drizzle" });
  return database;
}

type Db = Awaited<ReturnType<typeof freshDb>>;

async function newPlayer(database: Db) {
  const [player] = await database.insert(players).values({}).returning();
  if (!player) throw new Error("no player");
  return player.id;
}

let minute = 0;

/** Stores a run and its event log, each a minute after the last, so runs keep a known order. */
async function storeRun(database: Db, playerId: string, seed: string, events: RunEvent[]) {
  const [run] = await database
    .insert(runs)
    .values({
      playerId,
      seed,
      character: "intern",
      createdAt: new Date(Date.UTC(2026, 9, 31, 18, (minute += 1))),
    })
    .returning();
  if (!run) throw new Error("no run");
  await database
    .insert(runEvents)
    .values(events.map((event, seq) => ({ runId: run.id, seq, ...rowFromEvent(event) })));
  return run.id;
}

const started = (seed: string): RunEvent => ({
  kind: "run_started",
  seed,
  character: "intern",
  unlockedActs: 1,
});

const opened = (slot: 1 | 2 | 3, puzzleId: string, curse: CurseId | null = null): RunEvent => ({
  kind: "hour_opened",
  slot,
  puzzleId,
  curse,
});

/** Porch Lights cleared, then the Intern's two-relic offer answered with `answer`. */
function porchCleared(seed: string, answer: RunEvent): RunEvent[] {
  return [
    started(seed),
    opened(1, "porch-lights"),
    { kind: "hour_cleared", slot: 1 },
    { kind: "relic_offered", relics: ["black-cat", "spare-candle"] },
    answer,
  ];
}

const declined: RunEvent = { kind: "relic_declined" };

describe("loadEarnedClears", () => {
  let database: Db;

  beforeEach(async () => {
    database = await freshDb();
  });

  it("finds nothing for a player who never cleared an hour", async () => {
    const player = await newPlayer(database);
    await storeRun(database, player, "raven-pumpkin-13", [
      started("raven-pumpkin-13"),
      opened(1, "porch-lights"),
      { kind: "attempt_failed", slot: 1, checkpointId: "c1", revealedBatch: 1 },
    ]);
    expect(await loadEarnedClears(database, player)).toEqual([]);
  });

  it("earns each cleared hour once, with the latest night it was cleared on", async () => {
    const player = await newPlayer(database);
    await storeRun(
      database,
      player,
      "raven-pumpkin-13",
      porchCleared("raven-pumpkin-13", declined),
    );
    await storeRun(database, player, "moth-lantern-7", [
      ...porchCleared("moth-lantern-7", declined),
      opened(2, "thirteenth-door", "fog"),
      { kind: "hour_cleared", slot: 2 },
    ]);

    const earned = await loadEarnedClears(database, player);
    expect(earned).toEqual([
      {
        puzzleId: "porch-lights",
        seed: "moth-lantern-7",
        character: "intern",
        curse: null,
        candles: 4,
      },
      {
        puzzleId: "thirteenth-door",
        seed: "moth-lantern-7",
        character: "intern",
        curse: "fog",
        candles: 4,
      },
    ]);
  });

  it("earns nothing for an hour the Black Cat skipped", async () => {
    const player = await newPlayer(database);
    await storeRun(database, player, "raven-pumpkin-13", [
      ...porchCleared("raven-pumpkin-13", { kind: "relic_chosen", relic: "black-cat" }),
      opened(2, "thirteenth-door"),
      { kind: "hour_skipped", slot: 2 },
    ]);
    const earned = await loadEarnedClears(database, player);
    expect(earned.map((clear) => clear.puzzleId)).toEqual(["porch-lights"]);
  });

  it("reads only the player's own runs", async () => {
    const player = await newPlayer(database);
    const someoneElse = await newPlayer(database);
    await storeRun(
      database,
      someoneElse,
      "raven-pumpkin-13",
      porchCleared("raven-pumpkin-13", declined),
    );
    expect(await loadEarnedClears(database, player)).toEqual([]);
  });

  it("skips a run whose log no longer replays, and keeps the rest", async () => {
    const player = await newPlayer(database);
    const broken = await storeRun(database, player, "moth-lantern-7", [
      ...porchCleared("moth-lantern-7", declined),
      // A clear with no hour open: the reducer refuses it.
      { kind: "hour_cleared", slot: 2 },
    ]);
    await storeRun(database, player, "raven-pumpkin-13", [
      started("raven-pumpkin-13"),
      opened(1, "porch-lights", null),
      { kind: "hour_cleared", slot: 1 },
    ]);
    const logged = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const earned = await loadEarnedClears(database, player);

    expect(earned.map((clear) => clear.seed)).toEqual(["raven-pumpkin-13"]);
    expect(logged).toHaveBeenCalledWith(expect.stringContaining(broken), expect.anything());
    logged.mockRestore();
  });
});
