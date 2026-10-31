import { describe, expect, expectTypeOf, it } from "vitest";
import type { RelicId, RunPhase } from "@/server/engine/run/types";
import {
  nightStakes,
  previewBlockedReason,
  relicBlockedReason,
  runBlockedReason,
  targetPicker,
  type RelicBarHour,
  type RelicKind,
  type RelicView,
  type RunButtonsView,
  type RunPhaseView,
} from "./bottom-bar";

const hour: RelicBarHour = {
  phase: "in-hour",
  darkness: false,
  boss: false,
  feeds: ["bronze.porch_events", "bronze.sensors"],
  hiddenBatches: [
    { index: 3, arrivesAt: "6:40pm" },
    { index: 4, arrivesAt: "6:55pm" },
  ],
  goldTables: ["gold.lights_on"],
  nextCheckpoint: "7:00pm",
};

const relic = (kind: RelicKind, used = false): RelicView => ({
  kind,
  name: kind,
  flavor: "",
  effect: "",
  used,
});

describe("the shared view types", () => {
  it("mirror the engine's ids, so the server can hand them over unchanged", () => {
    expectTypeOf<RelicKind>().toEqualTypeOf<RelicId>();
    expectTypeOf<RunPhaseView>().toEqualTypeOf<RunPhase>();
  });
});

describe("targetPicker", () => {
  it("offers feeds to the lantern, hidden batches to the feather, gold tables to the hourglass", () => {
    expect(targetPicker("wrens-lantern", hour)?.options.map((o) => o.target)).toEqual([
      { kind: "feed", feed: "bronze.porch_events" },
      { kind: "feed", feed: "bronze.sensors" },
    ]);
    const feather = targetPicker("ravens-feather", hour);
    expect(feather?.options.map((o) => [o.label, o.detail, o.target])).toEqual([
      ["Batch 4", "lands at 6:40pm", { kind: "batch", batch: 3 }],
      ["Batch 5", "lands at 6:55pm", { kind: "batch", batch: 4 }],
    ]);
    const hourglass = targetPicker("hourglass", hour);
    expect(hourglass?.legend).toBe("Which table, at 7:00pm?");
    expect(hourglass?.options.map((o) => o.target)).toEqual([
      { kind: "table", table: "gold.lights_on" },
    ]);
  });

  it("asks nothing of the Black Cat and the Spare Candle, which need only a yes", () => {
    expect(targetPicker("black-cat", hour)).toBeNull();
    expect(targetPicker("spare-candle", hour)).toBeNull();
  });

  it("gives every option a distinct value", () => {
    for (const kind of ["wrens-lantern", "ravens-feather", "hourglass"] as const) {
      const values = targetPicker(kind, hour)?.options.map((o) => o.value) ?? [];
      expect(new Set(values).size).toBe(values.length);
    }
  });
});

describe("relicBlockedReason", () => {
  it("lets every held relic act in an ordinary open hour", () => {
    for (const kind of [
      "wrens-lantern",
      "ravens-feather",
      "hourglass",
      "black-cat",
      "spare-candle",
    ] as const) {
      expect(relicBlockedReason(relic(kind), hour)).toBeNull();
    }
  });

  it("names a spent relic first, whatever else is true", () => {
    expect(
      relicBlockedReason(relic("hourglass", true), { ...hour, darkness: true, phase: "ended" }),
    ).toMatch(/Already used/);
  });

  it("keeps relics asleep outside an open hour", () => {
    for (const phase of ["opening", "offering", "choosing", "ended"] as const) {
      expect(relicBlockedReason(relic("wrens-lantern"), { ...hour, phase })).toMatch(
        /only while an hour is open/,
      );
    }
  });

  it("blames the Curse of Darkness", () => {
    expect(relicBlockedReason(relic("black-cat"), { ...hour, darkness: true })).toMatch(
      /Curse of Darkness/,
    );
  });

  it("won't let the Black Cat cross a boss, but other relics still work there", () => {
    const boss = { ...hour, boss: true };
    expect(relicBlockedReason(relic("black-cat"), boss)).toMatch(/won't cross a boss/);
    expect(relicBlockedReason(relic("hourglass"), boss)).toBeNull();
  });

  it("says when there is nothing to point a relic at", () => {
    const empty = { ...hour, feeds: [], hiddenBatches: [], goldTables: [] };
    expect(relicBlockedReason(relic("wrens-lantern"), empty)).toMatch(/No feed/);
    expect(relicBlockedReason(relic("ravens-feather"), empty)).toMatch(/already landed/);
    expect(relicBlockedReason(relic("hourglass"), empty)).toMatch(/no gold table/);
    expect(relicBlockedReason(relic("spare-candle"), empty)).toBeNull();
  });
});

describe("run button reasons", () => {
  const ready: RunButtonsView = {
    engine: "ready",
    activity: "idle",
    compileError: null,
    boss: false,
    candles: 3,
  };

  it("lets both run when the engine is ready and the pipeline compiles", () => {
    expect(previewBlockedReason(ready)).toBeNull();
    expect(runBlockedReason(ready)).toBeNull();
  });

  it("waits for the engine, and says when it failed", () => {
    expect(previewBlockedReason({ ...ready, engine: "warming" })).toMatch(/warming up/);
    expect(runBlockedReason({ ...ready, engine: "failed" })).toMatch(/didn't start/);
  });

  it("names the model that doesn't compile", () => {
    const broken = { ...ready, compileError: "silver_lights" };
    expect(previewBlockedReason(broken)).toBe("silver_lights has an error. Fix it first.");
    expect(runBlockedReason(broken)).toBe("silver_lights has an error. Fix it first.");
  });

  it("lets the busy button show as busy and blocks the other", () => {
    expect(previewBlockedReason({ ...ready, activity: "previewing" })).toBeNull();
    expect(runBlockedReason({ ...ready, activity: "previewing" })).toMatch(/preview to finish/);
    expect(runBlockedReason({ ...ready, activity: "running" })).toBeNull();
    expect(previewBlockedReason({ ...ready, activity: "running" })).toMatch(/night is running/);
  });
});

describe("nightStakes", () => {
  it("costs 1 candle, or 2 on a boss", () => {
    expect(nightStakes(false, 3)).toEqual({
      cost: 1,
      last: false,
      summary: "If any checkpoint breaks, 1 candle goes out.",
    });
    expect(nightStakes(true, 3)).toEqual({
      cost: 2,
      last: false,
      summary: "This is a boss hour. If any checkpoint breaks, 2 candles go out.",
    });
  });

  it("warns when a break would end the run", () => {
    expect(nightStakes(false, 1).last).toBe(true);
    expect(nightStakes(false, 2).last).toBe(false);
    expect(nightStakes(true, 2).last).toBe(true);
  });
});
