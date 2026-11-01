import { describe, expect, it } from "vitest";
import { reportNight } from "../../lib/executor/report";
import { revealBatch } from "../../lib/executor/reveal";
import type { ExpectedHashes, NightEvent, RuntimeError } from "../../lib/executor/types";
import type { CompiledPipeline } from "../../lib/pipeline/compile";
import type { PuzzleData } from "../engine/puzzle";
import { generatePuzzle } from "../engine/registry";
import { fakePuzzle } from "../engine/testing/fake-puzzle";
import { expectedHashes } from "./expected";
import type { OpenHourData } from "./hour";
import { parseNightEvents, validateNight } from "./validate";

// Batches 0..2 with only batch 0 visible: early reads gold after 0, batch 1 is replayed, and
// late reads gold after 2.
const puzzle = fakePuzzle({ visibleBatchCount: 1, replayBatch: 1 });
const data = generatePuzzle(puzzle, "raven-pumpkin-13");
const pipeline: CompiledPipeline = { models: [], order: [] };
const steady = { "gold.totals": "a".repeat(64) };
const wrong = { "gold.totals": "f".repeat(64) };

// Both checkpoints read gold after batch 2, early first, so they share the batch.
const shared: PuzzleData = {
  ...data,
  checkpoints: data.checkpoints.map((found) => ({ ...found, afterBatch: 2 })),
};

function hourWith(revealed: readonly number[] = [], hourData = data): OpenHourData {
  return {
    hour: { slot: 1, puzzleId: puzzle.id, curse: null, failures: [], revealed },
    puzzle,
    data: hourData,
    retention: puzzle.retention,
  };
}

function checkpoint(
  id: "early" | "late",
  hashes: Record<string, string>,
  from: PuzzleData = data,
): NightEvent {
  const found = from.checkpoints.find((candidate) => candidate.id === id);
  if (!found) throw new Error(`fake puzzle has no ${id}`);
  return {
    kind: "checkpoint",
    checkpointId: id,
    label: found.label,
    afterBatch: found.afterBatch,
    hashes,
  };
}

function replay(after: Record<string, string> = steady): NightEvent {
  return { kind: "replay", batch: 1, before: steady, after };
}

function error(batch: number, phase: RuntimeError["phase"]): NightEvent {
  return {
    kind: "error",
    error: { code: "sql", batch, model: "gold.totals", phase, message: "Binder Error" },
  };
}

async function expected(): Promise<ExpectedHashes> {
  return expectedHashes(puzzle, data);
}

/** What the player's screen shows after this night: the client's report and reveal. */
function clientSees(events: readonly NightEvent[], hashes: ExpectedHashes, visible: number[]) {
  const report = reportNight(events, hashes, pipeline);
  if (!report) throw new Error("the client saw no failure");
  return {
    revealedBatch: report.revealedBatch,
    visible: revealBatch(data.batches, visible, report),
  };
}

describe("validateNight", () => {
  it("survives a night that matches every checkpoint and holds steady on the replay", async () => {
    const hashes = await expected();
    const events = [
      checkpoint("early", hashes.early ?? {}),
      replay(),
      checkpoint("late", hashes.late ?? {}),
    ];
    expect(validateNight(hourWith(), hashes, events)).toEqual({ survived: true });
  });

  describe("reveals the batch the client reveals", () => {
    it.each<[string, (hashes: ExpectedHashes) => NightEvent[], string, PuzzleData?]>([
      [
        "a wrong answer",
        (hashes) => [checkpoint("early", hashes.early ?? {}), replay(), checkpoint("late", wrong)],
        "late",
      ],
      [
        "a runtime error at a batch no checkpoint reads",
        (hashes) => [checkpoint("early", hashes.early ?? {}), error(1, "step")],
        "late",
      ],
      [
        "a runtime error while reading gold at a checkpoint",
        (hashes) => [checkpoint("early", hashes.early ?? {}), replay(), error(2, "checkpoint")],
        "late",
      ],
      ["a runtime error before the first checkpoint", () => [error(0, "step")], "early"],
      [
        "a runtime error while replaying the replay batch",
        (hashes) => [checkpoint("early", hashes.early ?? {}), error(1, "replay")],
        "late",
      ],
      [
        "a wrong answer at the second of two checkpoints on one batch",
        (hashes) => [
          replay(),
          checkpoint("early", hashes.early ?? {}, shared),
          checkpoint("late", wrong, shared),
        ],
        "late",
        shared,
      ],
      [
        "a runtime error reading gold for the second of two checkpoints on one batch",
        (hashes) => [
          replay(),
          checkpoint("early", hashes.early ?? {}, shared),
          error(2, "checkpoint"),
        ],
        "late",
        shared,
      ],
      [
        "a replay that flinches",
        (hashes) => [
          checkpoint("early", hashes.early ?? {}),
          replay(wrong),
          checkpoint("late", hashes.late ?? {}),
        ],
        "late",
      ],
    ])("after %s", async (_, night, checkpointId, hourData = data) => {
      const hashes = await expected();
      const events = night(hashes);
      for (const revealed of [[], [2]]) {
        const server = validateNight(hourWith(revealed, hourData), hashes, events);
        const shown = revealed.reduce(
          (visible, revealedBatch) => [...revealBatch(data.batches, visible, { revealedBatch })],
          [0],
        );
        expect(server).toEqual({
          survived: false,
          checkpointId,
          ...clientSees(events, hashes, shown),
        });
      }
    });
  });

  it("reports the last checkpoint when an error comes after every checkpoint passed", async () => {
    const lateFirst = fakePuzzle({ visibleBatchCount: 1 });
    const lateData = generatePuzzle(lateFirst, "raven-pumpkin-13");
    const hashes = await expectedHashes(lateFirst, lateData);
    const early = lateData.checkpoints[0];
    if (!early) throw new Error("fake puzzle has no checkpoint");
    // Move late to batch 1, so an error at batch 2 follows every checkpoint.
    const moved = {
      ...lateData,
      checkpoints: [early, { id: "late", afterBatch: 1, label: "18:15" }],
    };
    const events: NightEvent[] = [
      {
        kind: "checkpoint",
        checkpointId: "early",
        label: early.label,
        afterBatch: 0,
        hashes: hashes.early ?? {},
      },
      {
        kind: "checkpoint",
        checkpointId: "late",
        label: "18:15",
        afterBatch: 1,
        hashes: hashes.late ?? {},
      },
      error(2, "step"),
    ];
    const open: OpenHourData = { ...hourWith(), puzzle: lateFirst, data: moved };
    expect(validateNight(open, hashes, events)).toMatchObject({
      survived: false,
      checkpointId: "late",
      revealedBatch: 2,
    });
  });

  it("survives a night that passes two checkpoints on one batch", async () => {
    const hashes = await expected();
    const events = [
      replay(),
      checkpoint("early", hashes.early ?? {}, shared),
      checkpoint("late", hashes.late ?? {}, shared),
    ];
    expect(validateNight(hourWith([], shared), hashes, events)).toEqual({ survived: true });
  });

  describe("refuses a night that misreads two checkpoints on one batch", () => {
    it.each<[string, (hashes: ExpectedHashes) => NightEvent[]]>([
      [
        "the second checkpoint missing",
        (hashes) => [replay(), checkpoint("early", hashes.early ?? {}, shared)],
      ],
      [
        "the first checkpoint missing",
        (hashes) => [replay(), checkpoint("late", hashes.late ?? {}, shared)],
      ],
      [
        "the checkpoints out of order",
        (hashes) => [
          replay(),
          checkpoint("late", hashes.late ?? {}, shared),
          checkpoint("early", hashes.early ?? {}, shared),
        ],
      ],
      [
        "a checkpoint error after both checkpoints were read",
        (hashes) => [
          replay(),
          checkpoint("early", hashes.early ?? {}, shared),
          checkpoint("late", hashes.late ?? {}, shared),
          error(2, "checkpoint"),
        ],
      ],
    ])("with %s", async (_, night) => {
      const hashes = await expected();
      expect(validateNight(hourWith([], shared), hashes, night(hashes))).toBeNull();
    });
  });

  describe("refuses a night this hour could not produce", () => {
    it.each<[string, (hashes: ExpectedHashes) => NightEvent[]]>([
      ["no events", () => []],
      ["a night cut short without an error", (hashes) => [checkpoint("early", hashes.early ?? {})]],
      ["an error that skips a checkpoint", () => [error(1, "step")]],
      [
        "an error at a hidden batch that skips the replay",
        (hashes) => [checkpoint("early", hashes.early ?? {}), error(2, "step")],
      ],
      [
        "an error at a batch that does not exist",
        (hashes) => [
          checkpoint("early", hashes.early ?? {}),
          replay(),
          checkpoint("late", hashes.late ?? {}),
          error(9, "step"),
        ],
      ],
      ["a replay error at a batch that is not replayed", () => [error(0, "replay")]],
      [
        "a checkpoint error at a batch no checkpoint reads",
        (hashes) => [checkpoint("early", hashes.early ?? {}), error(1, "checkpoint")],
      ],
      [
        "a checkpoint error after the batch's checkpoints were all read",
        (hashes) => [checkpoint("early", hashes.early ?? {}), error(0, "checkpoint")],
      ],
      [
        "an event after the error",
        (hashes) => [error(0, "step"), checkpoint("early", hashes.early ?? {})],
      ],
      [
        "a replay of the wrong batch",
        (hashes) => [
          checkpoint("early", hashes.early ?? {}),
          { kind: "replay", batch: 2, before: steady, after: steady },
        ],
      ],
      [
        "a checkpoint with no hashes, which would otherwise match nothing and pass",
        (hashes) => [checkpoint("early", {}), replay(), checkpoint("late", hashes.late ?? {})],
      ],
      [
        "a checkpoint with an extra table",
        (hashes) => [
          checkpoint("early", { ...hashes.early, "gold.extra": "b".repeat(64) }),
          replay(),
          checkpoint("late", hashes.late ?? {}),
        ],
      ],
      [
        "a malformed hash",
        (hashes) => [
          checkpoint("early", { "gold.totals": "not-a-hash" }),
          replay(),
          checkpoint("late", hashes.late ?? {}),
        ],
      ],
      [
        "a checkpoint at the wrong batch",
        (hashes) => [
          {
            kind: "checkpoint",
            checkpointId: "early",
            label: "18:05",
            afterBatch: 1,
            hashes: hashes.early ?? {},
          },
          replay(),
          checkpoint("late", hashes.late ?? {}),
        ],
      ],
    ])("with %s", async (_, night) => {
      const hashes = await expected();
      expect(validateNight(hourWith(), hashes, night(hashes))).toBeNull();
    });
  });
});

describe("parseNightEvents", () => {
  it("rebuilds every kind of event, dropping fields it does not know", () => {
    const events = [
      { ...checkpoint("early", steady), extra: true },
      replay(),
      {
        kind: "error",
        error: {
          code: "row_limit",
          batch: 2,
          model: "gold.totals",
          phase: "checkpoint",
          message: "Too many",
          line: 3,
          column: 7,
          secret: 1,
        },
      },
    ];
    expect(parseNightEvents(events)).toEqual([
      checkpoint("early", steady),
      replay(),
      {
        kind: "error",
        error: {
          code: "row_limit",
          batch: 2,
          model: "gold.totals",
          phase: "checkpoint",
          message: "Too many",
          line: 3,
          column: 7,
        },
      },
    ]);
  });

  it.each<[string, unknown]>([
    ["a non-array", { events: [] }],
    ["an unknown kind", [{ kind: "survived" }]],
    ["a non-string hash", [{ ...checkpoint("early", steady), hashes: { "gold.totals": 1 } }]],
    ["a fractional batch", [{ kind: "replay", batch: 1.5, before: steady, after: steady }]],
    [
      "an unknown error code",
      [
        {
          kind: "error",
          error: { code: "toString", batch: 0, model: "m", phase: "step", message: "" },
        },
      ],
    ],
    [
      "an unknown phase",
      [
        {
          kind: "error",
          error: { code: "sql", batch: 0, model: "m", phase: "later", message: "" },
        },
      ],
    ],
  ])("refuses %s", (_, value) => {
    expect(parseNightEvents(value)).toBeNull();
  });
});
