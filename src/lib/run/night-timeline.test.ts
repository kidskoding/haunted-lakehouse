import { describe, expect, it } from "vitest";
import type { NightEvent, RuntimeError } from "../executor/types";
import { dialHour, nightTimeline, type NightSchedule } from "./night-timeline";

const schedule: NightSchedule = {
  batches: [0, 1, 2, 3, 4].map((index) => ({
    index,
    arrivesAt: `6:${String(10 + index * 10)}pm`,
    hidden: index >= 2,
  })),
  checkpoints: [
    { id: "first", afterBatch: 1, label: "6:30pm" },
    { id: "last", afterBatch: 4, label: "7:00pm" },
  ],
  replayBatch: 3,
};

const gold = (hash: string) => ({ "gold.lights": hash.repeat(64) });
const checkpoint = (id: string, afterBatch: number): NightEvent => ({
  kind: "checkpoint",
  checkpointId: id,
  label: id,
  afterBatch,
  hashes: gold("a"),
});
const replay = (after: string): NightEvent => ({
  kind: "replay",
  batch: 3,
  before: gold("b"),
  after: gold(after),
});
const error = (batch: number, phase: RuntimeError["phase"]): NightEvent => ({
  kind: "error",
  error: { code: "sql", batch, model: "silver.lights", phase, message: "nope" },
});

const full = [checkpoint("first", 1), replay("b"), checkpoint("last", 4)];

describe("nightTimeline", () => {
  it("plays every batch, the replay, and both checkpoints when the night survives", () => {
    const timeline = nightTimeline(schedule, full, { survived: true });
    expect(timeline.failure).toBeNull();
    expect(timeline.beats.map((beat) => `${beat.kind}:${beat.outcome}`)).toEqual([
      "batch:landed",
      "batch:landed",
      "checkpoint:passed",
      "batch:landed",
      "batch:landed",
      "replay:held",
      "batch:landed",
      "checkpoint:passed",
    ]);
  });

  it("freezes on the checkpoint the verdict names", () => {
    const timeline = nightTimeline(schedule, full, {
      survived: false,
      checkpointId: "last",
      revealedBatch: 4,
    });
    expect(timeline.failure).toEqual({
      kind: "checkpoint",
      checkpointId: "last",
      batch: 4,
      outcome: "cracked",
    });
    expect(timeline.beats.at(-1)).toBe(timeline.failure);
  });

  it("stops at the batch a runtime error struck, without landing it", () => {
    const events = [checkpoint("first", 1), error(2, "step")];
    const timeline = nightTimeline(schedule, events, {
      survived: false,
      checkpointId: "last",
      revealedBatch: 2,
    });
    expect(timeline.failure).toEqual({ kind: "batch", batch: 2, outcome: "broke" });
    expect(timeline.error?.batch).toBe(2);
    expect(timeline.beats.filter((beat) => beat.outcome === "landed")).toHaveLength(2);
  });

  it("breaks a checkpoint whose gold could not be read", () => {
    const timeline = nightTimeline(schedule, [error(1, "checkpoint")], {
      survived: false,
      checkpointId: "first",
      revealedBatch: 1,
    });
    expect(timeline.failure).toEqual({
      kind: "checkpoint",
      checkpointId: "first",
      batch: 1,
      outcome: "broke",
    });
  });

  it("freezes on a replay that changed gold", () => {
    const events = [checkpoint("first", 1), replay("c"), checkpoint("last", 4)];
    const timeline = nightTimeline(schedule, events, {
      survived: false,
      checkpointId: "last",
      revealedBatch: 3,
    });
    expect(timeline.failure).toEqual({ kind: "replay", batch: 3, outcome: "flinched" });
  });

  it("breaks the replay when the second run failed", () => {
    const timeline = nightTimeline(schedule, [checkpoint("first", 1), error(3, "replay")], {
      survived: false,
      checkpointId: "last",
      revealedBatch: 3,
    });
    expect(timeline.failure).toEqual({ kind: "replay", batch: 3, outcome: "broke" });
  });

  it("does not crack the last checkpoint when it only stands in for a later error", () => {
    const late: NightSchedule = { ...schedule, checkpoints: schedule.checkpoints.slice(0, 1) };
    const timeline = nightTimeline(late, [checkpoint("first", 1), replay("b"), error(4, "step")], {
      survived: false,
      checkpointId: "first",
      revealedBatch: 4,
    });
    expect(timeline.beats.find((beat) => beat.kind === "checkpoint")?.outcome).toBe("passed");
    expect(timeline.failure).toEqual({ kind: "batch", batch: 4, outcome: "broke" });
  });
});

describe("dialHour", () => {
  it("places clock times on a 12-hour dial", () => {
    expect(dialHour("7:15pm")).toBe(7.25);
    expect(dialHour("12:30am")).toBe(0.5);
    expect(dialHour("1:00AM")).toBe(1);
  });

  it("rejects text that is not a clock time", () => {
    expect(dialHour("19:00")).toBeNull();
    expect(dialHour("13:00pm")).toBeNull();
  });
});
