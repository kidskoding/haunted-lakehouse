import { PGlite } from "@electric-sql/pglite";
import { asc, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { beforeEach, describe, expect, it } from "vitest";
import { judgeNight } from "../../lib/executor/night";
import { reportFailure } from "../../lib/executor/report";
import { revealBatch } from "../../lib/executor/reveal";
import type { ExpectedHashes, GoldHashes, NightEvent } from "../../lib/executor/types";
import type { CompiledPipeline } from "../../lib/pipeline/compile";
import * as schema from "../db/schema";
import { players, runEvents, runs } from "../db/schema";
import { generatePuzzle } from "../engine/registry";
import { porchLights } from "../engine/puzzles/porch-lights";
import { rowFromEvent } from "../runs/events";
import { loadPlayerRunWith } from "../runs/load";
import { getBatch, listPreviewBatches, startNightAttempt } from "./access";
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

async function openPorchRun(database: Db, candlesViaFailures = 0, legacyFailure = false) {
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
      rowFromEvent({
        kind: "attempt_failed",
        slot: 1,
        checkpointId: "quarter-to",
        revealedBatch: 8,
      }),
    ),
    // Rows written before attempt_failed carried revealedBatch: the old server served no reveal.
    ...(legacyFailure
      ? [{ kind: "attempt_failed", payload: { slot: 1, checkpointId: "quarter-to" } }]
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

  const attemptToken = await openAttempt(database, run.id, player.id);
  return { player, run, attemptToken };
}

async function openAttempt(database: Db, runId: string, playerId: string, at = now) {
  const started = await startNightAttempt(database, { runId, playerId, now: at, secret });
  if (!started.ok) throw new Error(started.error);
  return started.attemptToken;
}

const data = generatePuzzle(porchLights, "raven-pumpkin-13");
const pipeline: CompiledPipeline = { models: [], order: [] };
const initiallyVisible = Array.from({ length: porchLights.visibleBatchCount }, (_, i) => i);
const GOLD = porchLights.goldTables[0] ?? "";
const wrong: GoldHashes = { [GOLD]: "f".repeat(64) };

/** The checkpoint events a full night yields, with `hashesAt` choosing each one's gold. */
function checkpointEvents(
  hashesAt: (id: string) => GoldHashes,
  upTo = data.batches.length,
): NightEvent[] {
  return data.checkpoints
    .filter((checkpoint) => checkpoint.afterBatch < upTo)
    .map((checkpoint) => ({
      kind: "checkpoint",
      checkpointId: checkpoint.id,
      label: checkpoint.label,
      afterBatch: checkpoint.afterBatch,
      hashes: hashesAt(checkpoint.id),
    }));
}

function stepError(batch: number): NightEvent {
  return {
    kind: "error",
    error: { code: "sql", batch, model: GOLD, phase: "step", message: "Binder Error" },
  };
}

/** What the player's screen shows after the night: the client's report and reveal. */
function clientSees(events: readonly NightEvent[], expected: ExpectedHashes) {
  const failure = judgeNight(events, expected);
  if (!failure) throw new Error("the client saw no failure");
  const report = reportFailure(failure, pipeline);
  return {
    revealedBatch: report.revealedBatch,
    visible: revealBatch(data.batches, initiallyVisible, report),
  };
}

async function storedEvents(database: Db, runId: string) {
  return database
    .select({ kind: runEvents.kind, payload: runEvents.payload })
    .from(runEvents)
    .where(eq(runEvents.runId, runId))
    .orderBy(asc(runEvents.seq));
}

describe("judgeNightAttempt", () => {
  let database: Db;

  beforeEach(async () => {
    database = await freshDb();
  });

  it("clears the hour when every hash matches and records hour_cleared", async () => {
    const { player, run, attemptToken } = await openPorchRun(database);
    const expected = await expectedHashes(porchLights, data);

    const result = await judgeNightAttempt(database, {
      runId: run.id,
      playerId: player.id,
      attemptToken,
      events: checkpointEvents((id) => expected[id] ?? {}),
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
    expect((await storedEvents(database, run.id)).at(-1)?.kind).toBe("hour_cleared");
  });

  it("applies exactly one of two judges racing on the same night", async () => {
    const { player, run, attemptToken } = await openPorchRun(database);
    const expected = await expectedHashes(porchLights, data);
    const judge = () =>
      judgeNightAttempt(database, {
        runId: run.id,
        playerId: player.id,
        attemptToken,
        events: checkpointEvents((id) => expected[id] ?? {}),
        now,
        secret,
      });

    const results = await Promise.all([judge(), judge()]);

    expect(results.filter((result) => result.ok)).toHaveLength(1);
    expect(results.filter((result) => !result.ok)).toEqual([{ ok: false, error: "stale" }]);
    const kinds = (await storedEvents(database, run.id)).map((row) => row.kind);
    expect(kinds.filter((kind) => kind === "hour_cleared")).toHaveLength(1);
    const replayed = await loadPlayerRunWith(database, run.id, player.id);
    expect(replayed?.state.phase).toBe("offering");
  });

  describe("records and serves the batch the client reveals", () => {
    it.each<[string, (expected: ExpectedHashes) => NightEvent[], string]>([
      [
        "a wrong answer at the first checkpoint",
        (expected) =>
          checkpointEvents((id) => (id === data.checkpoints[0]?.id ? wrong : (expected[id] ?? {}))),
        "quarter-past",
      ],
      [
        // The first hidden batch, which no checkpoint reads: the next checkpoint is at 8.
        "a runtime error at batch 7",
        (expected) => [...checkpointEvents((id) => expected[id] ?? {}, 7), stepError(7)],
        "quarter-to",
      ],
    ])("after %s", async (_, night, checkpointId) => {
      const { player, run, attemptToken } = await openPorchRun(database);
      const expected = await expectedHashes(porchLights, data);
      const events = night(expected);
      const shown = clientSees(events, expected);

      const result = await judgeNightAttempt(database, {
        runId: run.id,
        playerId: player.id,
        attemptToken,
        events,
        now,
        secret,
      });

      expect(result).toEqual({
        ok: true,
        survived: false,
        checkpointId,
        ...shown,
        candles: 3,
        status: "playing",
        phase: "in-hour",
        unlocks: [],
      });
      expect((await storedEvents(database, run.id)).at(-1)).toEqual({
        kind: "attempt_failed",
        payload: { slot: 1, checkpointId, revealedBatch: shown.revealedBatch },
      });

      const listed = await listPreviewBatches(database, run.id, player.id);
      if (!listed.ok) throw new Error(listed.error);
      expect(listed.batches.map((batch) => batch.index)).toEqual(shown.visible);
      const revealed = await getBatch(database, {
        runId: run.id,
        playerId: player.id,
        index: shown.revealedBatch,
        attemptToken: null,
        now,
        secret,
      });
      expect(revealed.ok).toBe(true);
    });
  });

  it.each<[string, () => NightEvent[]]>([
    ["an error that claims to reveal batch 7 without passing a checkpoint", () => [stepError(7)]],
    [
      // Porch Lights replays no batch, so no replay can flinch.
      "a replay this hour never runs",
      () => [{ kind: "replay", batch: 7, before: wrong, after: { [GOLD]: "0".repeat(64) } }],
    ],
    ["a night with no events", () => []],
  ])("refuses %s, spending nothing", async (_, night) => {
    const { player, run, attemptToken } = await openPorchRun(database);
    const before = await storedEvents(database, run.id);

    const result = await judgeNightAttempt(database, {
      runId: run.id,
      playerId: player.id,
      attemptToken,
      events: night(),
      now,
      secret,
    });

    expect(result).toEqual({ ok: false, error: "invalid-night" });
    expect(await storedEvents(database, run.id)).toEqual(before);
    const hidden = await getBatch(database, {
      runId: run.id,
      playerId: player.id,
      index: 7,
      attemptToken: null,
      now,
      secret,
    });
    expect(hidden).toEqual({ ok: false, error: "hidden" });
  });

  it("keeps earlier reveals visible after a later failure", async () => {
    const { player, run, attemptToken } = await openPorchRun(database, 1);
    const expected = await expectedHashes(porchLights, data);

    const result = await judgeNightAttempt(database, {
      runId: run.id,
      playerId: player.id,
      attemptToken,
      events: [...checkpointEvents((id) => expected[id] ?? {}, 7), stepError(7)],
      now,
      secret,
    });

    // The earlier failure revealed batch 8; this one reveals 7.
    expect(result).toMatchObject({ revealedBatch: 7, visible: [0, 1, 2, 3, 4, 5, 6, 7, 8] });
  });

  it("reads a failure stored before reveals were recorded as revealing nothing", async () => {
    const { player, run, attemptToken } = await openPorchRun(database, 0, true);

    const listed = await listPreviewBatches(database, run.id, player.id);
    if (!listed.ok) throw new Error(listed.error);
    expect(listed.batches.map((batch) => batch.index)).toEqual(initiallyVisible);
    const served = await getBatch(database, {
      runId: run.id,
      playerId: player.id,
      index: 0,
      attemptToken: null,
      now,
      secret,
    });
    expect(served.ok).toBe(true);
    const hidden = await getBatch(database, {
      runId: run.id,
      playerId: player.id,
      index: 8,
      attemptToken: null,
      now,
      secret,
    });
    expect(hidden).toEqual({ ok: false, error: "hidden" });

    const expected = await expectedHashes(porchLights, data);
    const result = await judgeNightAttempt(database, {
      runId: run.id,
      playerId: player.id,
      attemptToken,
      events: [...checkpointEvents((id) => expected[id] ?? {}, 7), stepError(7)],
      now,
      secret,
    });
    expect(result).toMatchObject({ revealedBatch: 7, visible: [...initiallyVisible, 7] });
  });

  it("kills the run when the last candles go out", async () => {
    // Intern starts with 4; three prior failures leave one candle for this miss.
    const { player, run, attemptToken } = await openPorchRun(database, 3);
    const expected = await expectedHashes(porchLights, data);

    const result = await judgeNightAttempt(database, {
      runId: run.id,
      playerId: player.id,
      attemptToken,
      events: checkpointEvents((id) =>
        id === data.checkpoints[0]?.id ? wrong : (expected[id] ?? {}),
      ),
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

  it("spends a token once: judging the same attempt again charges nothing", async () => {
    const { player, run, attemptToken } = await openPorchRun(database);
    const expected = await expectedHashes(porchLights, data);
    const judge = () =>
      judgeNightAttempt(database, {
        runId: run.id,
        playerId: player.id,
        attemptToken,
        events: checkpointEvents((id) =>
          id === data.checkpoints[0]?.id ? wrong : (expected[id] ?? {}),
        ),
        now,
        secret,
      });

    expect(await judge()).toMatchObject({ ok: true, survived: false, candles: 3 });
    expect(await judge()).toEqual({ ok: false, error: "invalid-attempt" });
    const kinds = (await storedEvents(database, run.id)).map((row) => row.kind);
    expect(kinds.filter((kind) => kind === "attempt_failed")).toHaveLength(1);
    expect((await loadPlayerRunWith(database, run.id, player.id))?.state.candles).toBe(3);
  });

  it("charges a candle for an attempt abandoned after its hidden batches were served", async () => {
    const { player, run, attemptToken } = await openPorchRun(database);
    const fetch = (token: string | null) =>
      getBatch(database, {
        runId: run.id,
        playerId: player.id,
        index: 7,
        attemptToken: token,
        now,
        secret,
      });
    expect((await fetch(attemptToken)).ok).toBe(true);

    const next = await openAttempt(database, run.id, player.id);

    const stored = await storedEvents(database, run.id);
    expect(stored.slice(-2)).toEqual([
      {
        kind: "attempt_failed",
        payload: { slot: 1, checkpointId: data.checkpoints[0]?.id, revealedBatch: null },
      },
      { kind: "attempt_started", payload: expect.objectContaining({ slot: 1 }) as unknown },
    ]);
    expect((await loadPlayerRunWith(database, run.id, player.id))?.state.candles).toBe(3);
    // The abandoned token is dead; only the new one opens the hidden night.
    expect(await fetch(attemptToken)).toEqual({ ok: false, error: "hidden" });
    expect((await fetch(next)).ok).toBe(true);
    const expected = await expectedHashes(porchLights, data);
    expect(
      await judgeNightAttempt(database, {
        runId: run.id,
        playerId: player.id,
        attemptToken,
        events: checkpointEvents((id) => expected[id] ?? {}),
        now,
        secret,
      }),
    ).toEqual({ ok: false, error: "invalid-attempt" });
  });

  it("ends the run when an abandoned attempt takes the last candle", async () => {
    const { player, run } = await openPorchRun(database, 3);
    expect(
      await startNightAttempt(database, { runId: run.id, playerId: player.id, now, secret }),
    ).toEqual({
      ok: false,
      error: "no-open-hour",
    });
    const [runRow] = await database.select().from(runs).where(eq(runs.id, run.id));
    expect(runRow?.status).toBe("dead");
  });

  it("rejects a missing or foreign attempt token", async () => {
    const { player, run } = await openPorchRun(database);
    expect(
      await judgeNightAttempt(database, {
        runId: run.id,
        playerId: player.id,
        attemptToken: "not-a-token",
        events: [],
        now,
        secret,
      }),
    ).toEqual({ ok: false, error: "invalid-attempt" });
  });
});
