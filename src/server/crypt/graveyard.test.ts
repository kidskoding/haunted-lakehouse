import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { beforeEach, describe, expect, it } from "vitest";
import { EVERY_STONE, LAST_PAGE, STONES_PER_PAGE } from "@/lib/crypt/graveyard";
import * as schema from "../db/schema";
import { players, runEvents, runs } from "../db/schema";
import type { CharacterId } from "../engine/run/types";
import { deathFromQuery } from "../narrative/tombstone-link";
import { graveyardFilterFrom, GRAVEYARD_HOURS, loadGraveyardWith } from "./graveyard";

async function freshDb() {
  const database = drizzle(new PGlite(), { schema });
  await migrate(database, { migrationsFolder: "drizzle" });
  return database;
}

type Db = Awaited<ReturnType<typeof freshDb>>;

interface Grave {
  readonly login?: string;
  readonly character?: CharacterId;
  readonly seed?: string;
  readonly status?: "dead" | "survived" | "active";
  readonly daily?: string;
  readonly slot?: 1 | 2 | 3;
  readonly puzzleId?: string;
  readonly checkpointId?: string;
  /** Minutes after 18:00 on Halloween that the run ended, which orders the hill. */
  readonly endedMinute: number;
}

const FIRST_CHECKPOINT: Readonly<Record<string, string>> = {
  "porch-lights": "half-past",
  "thirteenth-door": "bell",
  "possessed-feed": "eight-oclock",
};

function endedAt(minute: number): Date {
  return new Date(Date.UTC(2026, 9, 31, 23, 0) + minute * 60_000);
}

async function bury(database: Db, grave: Grave) {
  const [player] = await database
    .insert(players)
    .values(
      grave.login === undefined
        ? {}
        : { githubId: 1000 + grave.endedMinute, githubLogin: grave.login },
    )
    .returning();
  if (!player) throw new Error("no player");
  const [run] = await database
    .insert(runs)
    .values({
      playerId: player.id,
      seed: grave.seed ?? "raven-pumpkin-13",
      character: grave.character ?? "intern",
      status: grave.status ?? "dead",
      dailyDate: grave.daily ?? null,
      endedAt: endedAt(grave.endedMinute),
    })
    .returning();
  if (!run) throw new Error("no run");

  const slot = grave.slot ?? 1;
  const puzzleId = grave.puzzleId ?? "porch-lights";
  const checkpointId = grave.checkpointId ?? FIRST_CHECKPOINT[puzzleId] ?? "half-past";
  const events = [
    { kind: "run_started", payload: { seed: run.seed, character: run.character, unlockedActs: 1 } },
    // An earlier hour, cleared, so the death hour is not simply the first one opened.
    ...(slot > 1
      ? [
          { kind: "hour_opened", payload: { slot: 1, puzzleId: "porch-lights", curse: null } },
          { kind: "attempt_failed", payload: { slot: 1, checkpointId: "quarter-past" } },
          { kind: "hour_cleared", payload: { slot: 1 } },
        ]
      : []),
    { kind: "hour_opened", payload: { slot, puzzleId, curse: null } },
    { kind: "attempt_failed", payload: { slot, checkpointId, revealedBatch: 2 } },
  ];
  await database
    .insert(runEvents)
    .values(events.map((event, seq) => ({ runId: run.id, seq, ...event })));
  return { player, run };
}

describe("graveyardFilterFrom", () => {
  const parse = (query: string) => graveyardFilterFrom(new URLSearchParams(query));

  it("reads every filter a Graveyard link carries", () => {
    expect(parse("character=purist&hour=possessed-feed&daily=1&page=3")).toEqual({
      character: "purist",
      hour: "possessed-feed",
      daily: true,
      page: 3,
    });
  });

  it("is every stone when nothing is asked", () => {
    expect(parse("")).toEqual(EVERY_STONE);
  });

  it.each([
    ["an unknown character", "character=ghost"],
    ["an unknown hour", "hour=the-attic"],
    ["a repeated key", "character=intern&character=purist"],
    ["a daily flag that isn't 1", "daily=yes"],
    ["page zero", "page=0"],
    ["a negative page", "page=-2"],
    ["a fractional page", "page=1.5"],
    ["a padded page", "page=02"],
    ["a page past the last", `page=${String(LAST_PAGE + 1)}`],
  ])("falls back to the default for %s", (_, query) => {
    expect(parse(query)).toEqual(EVERY_STONE);
  });

  it("keeps the valid parts of a half-edited link", () => {
    expect(parse("character=ghost&hour=porch-lights")).toEqual({
      ...EVERY_STONE,
      hour: "porch-lights",
    });
  });

  it("offers only hours a run can die in, in the night's order", () => {
    expect(GRAVEYARD_HOURS.map(({ value }) => value)).toEqual([
      "porch-lights",
      "thirteenth-door",
      "possessed-feed",
    ]);
  });
});

describe("loadGraveyardWith", () => {
  let database: Db;

  beforeEach(async () => {
    database = await freshDb();
  });

  it("is an empty hill before anyone has died", async () => {
    await bury(database, { status: "survived", endedMinute: 1 });
    await bury(database, { status: "active", endedMinute: 2 });
    expect(await loadGraveyardWith(database, EVERY_STONE)).toEqual({ stones: [], hasMore: false });
  });

  it("engraves dead runs newest first, the way their death moment did", async () => {
    await bury(database, { login: "kidskoding", endedMinute: 5 });
    await bury(database, {
      character: "night_clerk",
      seed: "wraith-toffee-7",
      slot: 3,
      puzzleId: "possessed-feed",
      endedMinute: 40,
    });

    const { stones, hasMore } = await loadGraveyardWith(database, EVERY_STONE);

    expect(hasMore).toBe(false);
    expect(stones.map(({ stone }) => stone.hour)).toEqual(["The Possessed Feed", "Porch Lights"]);
    const [boss, early] = stones;
    expect(boss?.stone).toMatchObject({
      handle: "A New Hire",
      characterTitle: "The Night Clerk",
      wentOut: "went out at 8:00pm, Halloween 2026",
      seed: "wraith-toffee-7",
      hollowYear: false,
    });
    expect(boss?.replayPath).toBe("/run/new?seed=wraith-toffee-7");
    expect(early?.stone).toMatchObject({
      handle: "kidskoding",
      wentOut: "went out at 6:30pm, Halloween 2026",
    });
  });

  it("links each stone to a share page that engraves the same stone", async () => {
    await bury(database, { login: "kidskoding", daily: "2026-10-31", endedMinute: 1 });
    const [grave] = (await loadGraveyardWith(database, EVERY_STONE)).stones;
    if (!grave) throw new Error("no stone");

    const [path, query] = grave.sharePath.split("?");
    expect(path).toBe("/tombstone");
    const death = deathFromQuery(new URLSearchParams(query));
    expect(death).toMatchObject({ handle: "kidskoding", daily: true, seed: "raven-pumpkin-13" });
    expect(grave.stone.epitaph).toBe("Had one try. Used it.");
  });

  it("shows a login only for a GitHub identity", async () => {
    // A login without a GitHub id is not an identity the player claimed.
    const { player } = await bury(database, { endedMinute: 1 });
    await database.update(players).set({ githubLogin: "not-signed-in" });
    const { stones } = await loadGraveyardWith(database, EVERY_STONE);
    expect(stones[0]?.stone.handle).toBe("A New Hire");
    expect(JSON.stringify(stones)).not.toContain(player.id);
  });

  it("filters by character, by the hour that broke, and to Daily Haunt runs", async () => {
    await bury(database, { login: "intern-porch", endedMinute: 1 });
    await bury(database, { login: "purist-porch", character: "purist", endedMinute: 2 });
    await bury(database, {
      login: "purist-door",
      character: "purist",
      slot: 2,
      puzzleId: "thirteenth-door",
      daily: "2026-10-31",
      endedMinute: 3,
    });

    const handles = async (filter: Partial<typeof EVERY_STONE>) =>
      (await loadGraveyardWith(database, { ...EVERY_STONE, ...filter })).stones.map(
        ({ stone }) => stone.handle,
      );

    expect(await handles({ character: "purist" })).toEqual(["purist-door", "purist-porch"]);
    expect(await handles({ hour: "porch-lights" })).toEqual(["purist-porch", "intern-porch"]);
    expect(await handles({ hour: "thirteenth-door" })).toEqual(["purist-door"]);
    expect(await handles({ daily: true })).toEqual(["purist-door"]);
    expect(await handles({ character: "intern", hour: "thirteenth-door" })).toEqual([]);
  });

  it("pages back through the hill a page at a time", async () => {
    for (let minute = 0; minute < STONES_PER_PAGE + 2; minute += 1) {
      await bury(database, { login: `ghost-${String(minute)}`, endedMinute: minute });
    }

    const first = await loadGraveyardWith(database, EVERY_STONE);
    const second = await loadGraveyardWith(database, { ...EVERY_STONE, page: 2 });

    expect(first.stones).toHaveLength(STONES_PER_PAGE);
    expect(first.hasMore).toBe(true);
    expect(first.stones[0]?.stone.handle).toBe(`ghost-${String(STONES_PER_PAGE + 1)}`);
    expect(second.stones.map(({ stone }) => stone.handle)).toEqual(["ghost-1", "ghost-0"]);
    expect(second.hasMore).toBe(false);
  });

  it("never offers a page past the last", async () => {
    for (let minute = 0; minute < STONES_PER_PAGE + 1; minute += 1) {
      await bury(database, { endedMinute: minute });
    }
    // Offsetting to the last page reads nothing here, but the flag must still say stop.
    const last = await loadGraveyardWith(database, { ...EVERY_STONE, page: LAST_PAGE });
    expect(last.hasMore).toBe(false);
  });

  it("leaves out a run recorded against a checkpoint the night no longer has", async () => {
    await bury(database, { login: "kept", endedMinute: 1 });
    await bury(database, { login: "lost", checkpointId: "midnight", endedMinute: 2 });
    const { stones } = await loadGraveyardWith(database, EVERY_STONE);
    expect(stones.map(({ stone }) => stone.handle)).toEqual(["kept"]);
  });
});
