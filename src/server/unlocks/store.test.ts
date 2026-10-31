import { PGlite } from "@electric-sql/pglite";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { beforeEach, describe, expect, it } from "vitest";
import * as schema from "../db/schema";
import { players, runs } from "../db/schema";
import type { RunState } from "../engine/run/types";
import { PAGE_IDS } from "../narrative/progress";
import { applyUnlocksAfterReduce } from "./apply";
import { awardsForBossClear } from "./progress";
import { grantFragment, grantUnlocks, loadPlayerUnlocks } from "./store";

async function freshDb() {
  const database = drizzle(new PGlite(), { schema });
  await migrate(database, { migrationsFolder: "drizzle" });
  return database;
}

type Db = Awaited<ReturnType<typeof freshDb>>;

async function newPlayer(database: Db) {
  const [player] = await database.insert(players).values({}).returning();
  if (!player) throw new Error("no player");
  return player;
}

async function newRun(database: Db, playerId: string, status: "active" | "survived" = "active") {
  const [run] = await database
    .insert(runs)
    .values({
      playerId,
      seed: "raven-pumpkin-13",
      character: "intern",
      status,
      endedAt: status === "active" ? null : new Date(),
    })
    .returning();
  if (!run) throw new Error("no run");
  return run;
}

function state(over: Partial<RunState> = {}): RunState {
  return {
    seed: "raven-pumpkin-13",
    character: "intern",
    unlockedActs: 1,
    status: "playing",
    phase: "in-hour",
    candles: 2,
    tableMaterialization: true,
    slot: 3,
    hour: null,
    history: [],
    relics: [],
    offer: null,
    actReached: 1,
    lastEnding: null,
    ...over,
  };
}

describe("unlock store", () => {
  let database: Db;

  beforeEach(async () => {
    database = await freshDb();
  });

  it("starts a player with Act I and only the Intern", async () => {
    const player = await newPlayer(database);
    await newRun(database, player.id, "survived");
    await newRun(database, player.id, "survived");

    expect(await loadPlayerUnlocks(database, player.id)).toEqual({
      unlockedActs: 1,
      characters: ["intern"],
      endings: [],
      fragments: [],
      runsFinished: 2,
    });
  });

  it("grants unlocks idempotently", async () => {
    const player = await newPlayer(database);
    const awards = awardsForBossClear("act-1", []);
    expect(await grantUnlocks(database, player.id, awards)).toHaveLength(3);
    expect(await grantUnlocks(database, player.id, awards)).toEqual([]);

    const progress = await loadPlayerUnlocks(database, player.id);
    expect(progress.unlockedActs).toBe(2);
    expect(progress.characters).toEqual(["intern", "night_clerk"]);
    expect(progress.endings).toEqual(["act-1"]);
  });

  it("records ledger pages once and keeps them when the finding run is deleted", async () => {
    const player = await newPlayer(database);
    const run = await newRun(database, player.id);
    expect(await grantFragment(database, player.id, "page-3", run.id)).toBe(true);
    expect(await grantFragment(database, player.id, "page-3", run.id)).toBe(false);

    await database.delete(runs).where(eq(runs.id, run.id));
    const progress = await loadPlayerUnlocks(database, player.id);
    expect(progress.fragments).toEqual(["page-3"]);
  });

  it("rejects a foreign finding run via the composite foreign key", async () => {
    const player = await newPlayer(database);
    const other = await newPlayer(database);
    const foreign = await newRun(database, other.id);
    await expect(grantFragment(database, player.id, "page-1", foreign.id)).rejects.toThrow();
  });

  it("applies Act I boss unlocks after a reduce that reveals the ending", async () => {
    const player = await newPlayer(database);
    const before = state({ lastEnding: null });
    const after = state({ lastEnding: "act-1", status: "won-act", phase: "ended" });

    const granted = await applyUnlocksAfterReduce(database, player.id, before, after);
    expect(granted).toEqual(awardsForBossClear("act-1", []));

    const again = await applyUnlocksAfterReduce(database, player.id, before, after);
    expect(again).toEqual([]);
  });

  it("turns a Séance clear into the true ending once every page is held", async () => {
    const player = await newPlayer(database);
    for (const page of PAGE_IDS) {
      await grantFragment(database, player.id, page, null);
    }

    const granted = await applyUnlocksAfterReduce(
      database,
      player.id,
      state({ lastEnding: null, unlockedActs: 3, slot: 10 }),
      state({
        lastEnding: "act-3",
        unlockedActs: 3,
        slot: 10,
        status: "victory",
        phase: "ended",
      }),
    );

    expect(granted).toEqual([
      { kind: "ending", key: "true" },
      { kind: "character", key: "old_wren" },
    ]);
    const progress = await loadPlayerUnlocks(database, player.id);
    expect(progress.characters).toContain("old_wren");
    expect(progress.endings).toEqual(["true"]);
  });
});
