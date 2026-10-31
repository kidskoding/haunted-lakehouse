import { describe, expect, it } from "vitest";
import type { NightEvent } from "../executor/types";
import { failureFromVerdict } from "./failure";
import type { NightSchedule } from "./night-timeline";

const schedule: NightSchedule = {
  batches: [0, 1, 2].map((index) => ({ index, arrivesAt: "6:05pm", hidden: index > 0 })),
  checkpoints: [
    { id: "early", afterBatch: 0, label: "6:15pm" },
    { id: "late", afterBatch: 2, label: "6:30pm" },
  ],
  replayBatch: 1,
};

const hashes = { "gold.lit": "a".repeat(64) };
const checkpoint = (id: string, afterBatch: number): NightEvent => ({
  kind: "checkpoint",
  checkpointId: id,
  label: id,
  afterBatch,
  hashes,
});

describe("failureFromVerdict", () => {
  it("names the checkpoint and every gold table for a wrong answer", () => {
    const events = [checkpoint("early", 0), checkpoint("late", 2)];
    expect(
      failureFromVerdict(
        { survived: false, checkpointId: "late", revealedBatch: 2 },
        events,
        schedule,
        ["gold.lit", "gold.dark"],
      ),
    ).toEqual({
      kind: "checkpoint",
      checkpointId: "late",
      label: "6:30pm",
      tables: ["gold.dark", "gold.lit"],
      revealedBatch: 2,
    });
  });

  it("keeps the runtime error that stopped the night", () => {
    const error = {
      code: "sql" as const,
      batch: 2,
      model: "gold.lit",
      phase: "step" as const,
      message: "Binder Error",
    };
    const events: NightEvent[] = [checkpoint("early", 0), { kind: "error", error }];
    expect(
      failureFromVerdict(
        { survived: false, checkpointId: "late", revealedBatch: 2 },
        events,
        schedule,
        ["gold.lit"],
      ),
    ).toEqual({ kind: "error", error, revealedBatch: 2 });
  });

  it("reports a replay that changed gold", () => {
    const events: NightEvent[] = [
      checkpoint("early", 0),
      { kind: "replay", batch: 1, before: hashes, after: { "gold.lit": "b".repeat(64) } },
    ];
    expect(
      failureFromVerdict(
        { survived: false, checkpointId: "late", revealedBatch: 1 },
        events,
        schedule,
        ["gold.lit"],
      ),
    ).toEqual({ kind: "replay", revealedBatch: 1 });
  });
});
