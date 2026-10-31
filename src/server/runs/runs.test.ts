import { PGlite } from "@electric-sql/pglite";
import { asc, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { beforeEach, describe, expect, it } from "vitest";
import { dailyAttemptWith } from "../daily/daily";
import * as schema from "../db/schema";
import { dailyResults, runEvents } from "../db/schema";
import { generatePuzzle } from "../engine/registry";
import type { RunEvent } from "../engine/run/types";
import { dailySeed, isHumanSeed } from "../engine/seed";
import { FRESH_UNLOCKS } from "../unlocks/progress";
import { advanceRun, answerOffer } from "./advance";
import { appendRunEvent } from "./append";
import { createRun } from "./create";
import { loadOwnedRunWith, loadPlayerRunWith, puzzleRegistry, runMachine } from "./load";
import { runView } from "./view";

const SEED = "raven-pumpkin-13";
const VIEWER = { handle: null, unlocks: FRESH_UNLOCKS };

async function freshDb() {
  const database = drizzle(new PGlite(), { schema });
  await migrate(database, { migrationsFolder: "drizzle" });
  return database;
}

type Db = Awaited<ReturnType<typeof freshDb>>;

async function started(database: Db, playerId: string, seed: string | null = SEED) {
  const created = await createRun(database, { playerId, character: "intern", seed });
  if (!created.ok) throw new Error(created.error);
  return created.runId;
}

async function load(database: Db, runId: string, playerId: string) {
  const run = await loadPlayerRunWith(database, runId, playerId);
  if (!run) throw new Error("no run");
  return run;
}

/** Appends what the judge would after a night: a clear or a failure at the first checkpoint. */
async function night(database: Db, runId: string, playerId: string, survived: boolean) {
  const { state } = await load(database, runId, playerId);
  const hour = state.hour;
  if (!hour) throw new Error("no open hour");
  const puzzle = puzzleRegistry.get(hour.puzzleId);
  if (!puzzle) throw new Error("no puzzle");
  const checkpoint = generatePuzzle(puzzle, state.seed).checkpoints[0];
  if (!checkpoint) throw new Error("no checkpoint");
  const event: RunEvent = survived
    ? { kind: "hour_cleared", slot: hour.slot }
    : {
        kind: "attempt_failed",
        slot: hour.slot,
        checkpointId: checkpoint.id,
        revealedBatch: checkpoint.afterBatch,
      };
  await appendRunEvent(database, runId, event, runMachine.reduce(state, event));
}

describe("starting a run", () => {
  let database: Db;
  const playerId = crypto.randomUUID();

  beforeEach(async () => {
    database = await freshDb();
  });

  it("records run_started and opens the first hour", async () => {
    const runId = await started(database, playerId);
    const rows = await database
      .select({ kind: runEvents.kind, payload: runEvents.payload })
      .from(runEvents)
      .where(eq(runEvents.runId, runId))
      .orderBy(asc(runEvents.seq));
    expect(rows.map((row) => row.kind)).toEqual(["run_started", "hour_opened"]);
    expect(rows[0]?.payload).toEqual({ seed: SEED, character: "intern", unlockedActs: 1 });
    expect(rows[1]?.payload).toMatchObject({ slot: 1, puzzleId: "porch-lights" });

    const run = await load(database, runId, playerId);
    expect(run.state.phase).toBe("in-hour");
    expect(run.status).toBe("active");
  });

  it("draws a seed when none is given", async () => {
    const run = await load(database, await started(database, playerId, null), playerId);
    expect(isHumanSeed(run.seed)).toBe(true);
  });

  it.each([
    ["an unknown character", { character: "ghost", seed: SEED }, "invalid-character"],
    ["a seed no generator drew", { character: "intern", seed: "drop-table-1" }, "invalid-seed"],
    ["a character still locked", { character: "night_clerk", seed: SEED }, "locked-character"],
  ])("refuses %s", async (_, input, error) => {
    expect(await createRun(database, { playerId, ...input })).toEqual({ ok: false, error });
  });

  it("shows a run only to its own player", async () => {
    const runId = await started(database, playerId);
    expect(await loadPlayerRunWith(database, runId, crypto.randomUUID())).toBeNull();
    expect(await loadPlayerRunWith(database, "not-a-uuid", playerId)).toBeNull();
  });
});

describe("the run view", () => {
  let database: Db;
  let runId: string;
  const playerId = crypto.randomUUID();

  beforeEach(async () => {
    database = await freshDb();
    runId = await started(database, playerId);
  });

  it("maps the open hour onto the run screen", async () => {
    const view = runView(await load(database, runId, playerId), VIEWER);
    const puzzle = puzzleRegistry.get("porch-lights");
    if (!puzzle) throw new Error("no puzzle");
    const data = generatePuzzle(puzzle, SEED);

    expect(view).toMatchObject({
      runId,
      seed: SEED,
      status: "playing",
      phase: "in-hour",
      tableMaterialization: true,
      knownFeeds: ["porch_lights"],
      topBar: { candles: { lit: 4, total: 4 }, slot: 1, seed: SEED, curse: null },
      relics: [{ kind: "wrens-lantern", name: "Wren's Lantern" }],
      cleared: null,
      death: null,
    });
    expect(view.topBar.slots.filter((slot) => slot.repeat).map((slot) => slot.slot)).toEqual([9]);

    const hour = view.hour;
    if (!hour) throw new Error("no hour");
    expect(hour).toMatchObject({
      slot: 1,
      puzzleId: "porch-lights",
      title: "Porch Lights",
      boss: false,
      feeds: ["porch_lights"],
      retention: puzzle.retention,
      goldTables: ["gold.welcoming_houses"],
      replayBatch: null,
      lastLoss: null,
    });
    expect(hour.story.lines.length).toBeGreaterThan(0);
    expect(hour.story.asides.length).toBeGreaterThan(0);
    expect(hour.checkpoints).toEqual(data.checkpoints);
    expect(hour.visible).toEqual(
      Array.from({ length: puzzle.visibleBatchCount }, (_, index) => index),
    );
    expect(hour.schedule.batches.map((batch) => batch.hidden)).toEqual(
      data.batches.map((batch) => batch.index >= puzzle.visibleBatchCount),
    );
    expect(hour.schedule.checkpoints[0]?.label).toMatch(/^\d{1,2}:\d{2}pm$/);
    expect(hour.relicHour.hiddenBatches.map((batch) => batch.index)).toEqual(
      data.batches.slice(puzzle.visibleBatchCount).map((batch) => batch.index),
    );
  });

  it("never carries expected gold or hidden rows", async () => {
    const text = JSON.stringify(runView(await load(database, runId, playerId), VIEWER));
    expect(text).not.toMatch(/"expected"|"feeds":\{|house_id/);
  });

  it("shows the candle a failed night cost, and the batch it revealed", async () => {
    await night(database, runId, playerId, false);
    const view = runView(await load(database, runId, playerId), VIEWER);
    expect(view.topBar.candles).toEqual({ lit: 3, total: 4 });
    expect(view.hour?.lastLoss?.cost).toBe(1);
    expect(view.hour?.lastLoss?.reaction.length).toBeGreaterThan(0);
    // The Mayor's quote of the player's number is withheld, never invented.
    expect(JSON.stringify(view.hour?.lastLoss)).not.toContain('"key":"shown_value","text":"');
  });

  it("engraves a stone when the last candle goes out", async () => {
    for (let i = 0; i < 4; i++) await night(database, runId, playerId, false);
    const run = await load(database, runId, playerId);
    expect(run.status).toBe("dead");
    expect(await loadOwnedRunWith(database, runId, playerId)).toBeNull();

    const view = runView(run, VIEWER);
    expect(view.hour).toBeNull();
    expect(view.death?.stone).toMatchObject({ seed: SEED, hour: "Porch Lights" });
    expect(view.death?.sharePath).toMatch(/^\/tombstone\?/);
  });

  it("offers relics after a clear, then opens the next hour on a choice", async () => {
    await night(database, runId, playerId, true);
    const offered = await advanceRun(database, runId, playerId);
    if (!offered.ok) throw new Error(offered.error);
    expect(offered.run.state.phase).toBe("choosing");

    const view = runView(offered.run, VIEWER);
    expect(view.hour).toBeNull();
    expect(view.cleared?.title).toBe("Porch Lights");
    expect(view.cleared?.autopsy.title.length).toBeGreaterThan(0);
    const offer = view.cleared?.offer.map((relic) => relic.kind) ?? [];
    expect(offer).toHaveLength(2);

    expect(await answerOffer(database, runId, playerId, "not-a-relic")).toEqual({
      ok: false,
      error: "not-offered",
    });
    const [relic] = offer;
    if (!relic) throw new Error("no relic");
    const chosen = await answerOffer(database, runId, playerId, relic);
    if (!chosen.ok) throw new Error(chosen.error);
    expect(chosen.run.state).toMatchObject({ phase: "in-hour", slot: 2 });
    expect(chosen.run.state.relics).toContain(relic);
    expect(runView(chosen.run, VIEWER).cleared).toBeNull();
  });

  it("opens the next hour when the player takes no relic", async () => {
    await night(database, runId, playerId, true);
    await advanceRun(database, runId, playerId);
    const declined = await answerOffer(database, runId, playerId, null);
    if (!declined.ok) throw new Error(declined.error);
    expect(declined.run.state).toMatchObject({
      phase: "in-hour",
      slot: 2,
      relics: ["wrens-lantern"],
    });
    expect(await answerOffer(database, runId, playerId, null)).toEqual({
      ok: false,
      error: "not-choosing",
    });
  });
});

describe("the Daily Haunt", () => {
  const DATE = "2026-10-31";
  let database: Db;
  const playerId = crypto.randomUUID();

  beforeEach(async () => {
    database = await freshDb();
  });

  async function daily(seed: string | null = SEED) {
    return createRun(database, { playerId, character: "intern", seed, dailyDate: DATE });
  }

  it("plays the date's seed whatever the client asked for", async () => {
    const created = await daily();
    if (!created.ok) throw new Error(created.error);
    const run = await load(database, created.runId, playerId);
    expect(run.seed).toBe(dailySeed(DATE));
    expect(run.seed).not.toBe(SEED);
    expect(await dailyAttemptWith(database, playerId, DATE)).toEqual({
      kind: "in-progress",
      runId: created.runId,
    });
  });

  it("allows one attempt a day, in progress or finished", async () => {
    const created = await daily();
    if (!created.ok) throw new Error(created.error);
    expect(await daily(null)).toEqual({ ok: false, error: "daily-taken" });
    for (let i = 0; i < 4; i++) await night(database, created.runId, playerId, false);
    expect(await daily()).toEqual({ ok: false, error: "daily-taken" });
    // An ordinary run the same day is still the player's to start.
    expect((await createRun(database, { playerId, character: "intern", seed: SEED })).ok).toBe(
      true,
    );
  });

  it("posts its hours cleared and candles left when the run ends", async () => {
    const created = await daily();
    if (!created.ok) throw new Error(created.error);
    const { runId } = created;
    await night(database, runId, playerId, true);
    await advanceRun(database, runId, playerId);
    await answerOffer(database, runId, playerId, null);
    await night(database, runId, playerId, false);
    expect(await database.select().from(dailyResults)).toEqual([]);

    for (let i = 0; i < 3; i++) await night(database, runId, playerId, false);
    expect(
      await database
        .select({
          runId: dailyResults.runId,
          dailyDate: dailyResults.dailyDate,
          slotsCleared: dailyResults.slotsCleared,
          candlesLeft: dailyResults.candlesLeft,
        })
        .from(dailyResults),
    ).toEqual([{ runId, dailyDate: DATE, slotsCleared: 1, candlesLeft: 0 }]);
    expect(await dailyAttemptWith(database, playerId, DATE)).toMatchObject({
      kind: "finished",
      result: { slotsCleared: 1, candlesLeft: 0, rank: 1 },
    });
  });

  it("never posts an ordinary run", async () => {
    const runId = await started(database, playerId);
    for (let i = 0; i < 4; i++) await night(database, runId, playerId, false);
    expect(await database.select().from(dailyResults)).toEqual([]);
  });
});
